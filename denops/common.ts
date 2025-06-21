import { ActionArguments, BaseParams, DduItem, Item, ItemInfo, Actions, ActionFlags, Previewer, PreviewContext, ItemHighlight } from "jsr:@shougo/ddu-vim/types";
import { GatherArguments } from "jsr:@shougo/ddu-vim/source";
import { Context } from "jsr:@shougo/ddu-vim/types";
import { Denops } from "jsr:@denops/std";
import { expr } from "jsr:@denops/std/eval/expression";
import { nvim_eval } from "jsr:@denops/std/function/nvim";
import { ensure } from "jsr:@denops/std/buffer";
import { toText } from "jsr:@std/streams";
import { setreg, getreginfo, strlen, cursor, col } from "jsr:@denops/std/function";
import { toJson } from "jsr:@std/streams";
import { twas } from "jsr:@augustinmauroy/twas";

/*
 * Defines the theme configuration for items of DDU list
 */
export type K8sTheme = {
	hl_groups: {
		prefix_icon: string;
		resource_version: string;
		uid: string;
		creation_timestamp: string;
		label: string;
		annotation: string;
		owner_reference: string;
		selector_match_label: string;
		selector_match_expr: string;
		l1_info: string;
		l2_info: string;
		l3_info: string;
	},
	icons: {
		prefix: string;
		creation_timestamp: string;
		resource_version: string;
		label: string;
		annotation: string;
		owner_reference: string;
		selector_match_label: string;
		selector_match_expr: string;
	};
}

export const DEFAULT_THEME: K8sTheme = {
	hl_groups: {
		prefix_icon: "Directory",
		resource_version: "Label",
		uid: "Comment",
		creation_timestamp: "Comment",
		label: "DiagnosticWarn",
		annotation: "Comment",
		owner_reference: "Type",
		selector_match_label: "DiagnosticWarn",
		selector_match_expr: "Title",
		l1_info: "DiagnosticWarn",
		l2_info: "DiagnosticInfo",
		l3_info: "SpecialKey",
	},
	icons: {
		prefix: "",
		creation_timestamp: "󱫢",
		resource_version: "",
		label: "",
		annotation: "󰪛",
		owner_reference: "󱘎",
		selector_match_label: "",
		selector_match_expr: "",
	},
}

/*
 * By definition of K8sTheme, this function converts "g:dduk8s#theme"(vim.g['dduk8s#theme']) of global variable in VIM to corresponding properties.
 */
export async function grabThemeConfig(denops: Denops): Promise<K8sTheme> {
	const globalVarOfTheme = expr`exists("g:dduk8s#theme") ? g:dduk8s#theme : {}`;

	const currentTheme = await nvim_eval(denops, globalVarOfTheme) as K8sTheme;

	// Merges DEFAULT_THEME to currentTheme if and only if the properties of currentTheme are empty.
	return {
		hl_groups: Object.assign({}, DEFAULT_THEME.hl_groups, currentTheme.hl_groups ?? {}),
		icons: Object.assign({}, DEFAULT_THEME.icons, currentTheme.icons ?? {}),
	}
}

/*
 * The structure of ObjectReference for Kubernetes API.
 */
export type K8sTargetRef = {
	kind: string;
	name: string;
	uid: string;
}

/*
 * The worker implements functions that
 * converts <S> type to Promise<Item<D>>
 *
 * <S> - Source type
 * <D> - Distination type
 * <P> - Type of parameters for the source
 */
export interface K8sObjectToDduItemWorker<S extends K8sObjectBase, D extends CommonMeta, P extends CommonParams> {
	/*
	 * Client code is responsible for converting source data to DDU item.
	 *
	 * args - GatherArguments provided DDU source
	 * source - The loaded data of K8S object.
	 * actionData - The constructed data of action to be modified.
	 */
	toActionData: (args: GatherArguments<P>, source: S, actionData: D) => Promise<void>;

	/*
	 * Constructs a builder(which is type of DduItemAttrWorker) to prepare attributes of DDU item.
	 *
	 * Client code is responsible for implementing DduItemAttrWorker.
	 *
	 * The worker must has a constructor with same signature of the "new" definition.
	 */
	itemAttrWorker: new (args: GatherArguments<P>, actionData: D) => DduItemAttrWorker;
}

/*
 * The worker used to construct properties of DDU Item.
 */
export interface DduItemAttrWorker {
	/*
	 * Builds "display" attribute of DDU item.
	 */
	displayComponents(theme?: K8sTheme): Promise<string[]>;
	/*
	 * Builds "word" attribute of DDU item.
	 */
	word(): Promise<string>;
	/*
	 * Builds "highlights" attribute of DDU item.
	 *
	 * displayComponents - The components of display.
	 */
	highlights(theme?: K8sTheme): Promise<HighlightsOfComponent>;
	/*
	 * Builds "info" attribute of DDU item(if and only if CommonParams.show_detail is true).
	 *
	 * commonInfo - The built-in information for K8S resources(labels, annotations, etc).
	 */
	info(commonInfo: ItemInfo[], theme?: K8sTheme): Promise<ItemInfo[]>;
}

/*
 * Factory for creating Item<D> from source data.
 */
export class ItemFactory {
	private readonly kindToGet: string;

	/*
	 * Creates factory with kind of K8S.
	 */
	public constructor(kindToGet: string)
	{
		this.kindToGet = kindToGet;
	}

	/*
	 * Builds function for Source.gather.
	 */
	public buildGather<S extends K8sObjectBase, D extends CommonMeta, P extends CommonParams>(
		worker: K8sObjectToDduItemWorker<S, D, P>
	) : (args: GatherArguments<P>) => ReadableStream<Item<D>[]>
	{
		const kindToGet = this.kindToGet;

		return (args: GatherArguments<P>): ReadableStream<Item<D>[]> => {
			const underlyingSource = {
				async start(controller: ReadableStreamDefaultController) {
					const currentTheme = await grabThemeConfig(args.denops);

					const cmdArgs = [ 'get', kindToGet, '-o', 'json' ];

					const proc = buildKubectlCmd(
						args.sourceParams, cmdArgs
					).spawn();

					checkErrorOfProcess(proc, `${cmdArgs[0]} ${cmdArgs[1]}`);

					const jsonOutput = await toJson(proc.stdout) as { items: S[] };

					const items: Item<D>[] = [];
					for await (const item of jsonOutput.items) {
						const newActionData: D = distillMeta(item, args.sourceParams.context);

						await worker.toActionData(args, item, newActionData);
						const itemAttrWorker = new worker.itemAttrWorker(args, newActionData);

						const displayComponents = await itemAttrWorker.displayComponents(currentTheme);
						const newItem: Item<D> = {
							// Don't know why: matcher_fzf needs a empty character to match first part of word
							word: await itemAttrWorker.word(),
							display: displayComponents.join(' '),
							highlights: await buildItemHighlights(
								args.denops, displayComponents,
								await itemAttrWorker.highlights(currentTheme)
							),
						};

						newItem.data = newActionData;
						newItem.action = newActionData;

						if (args.sourceParams.show_detail) {
							newItem.info = await itemAttrWorker.info(
								_buildResourceInfo(args.sourceParams, newActionData, currentTheme),
								currentTheme
							);
						}

						items.push(newItem);
					}

					controller.enqueue(items);
					controller.close();
				}
			}

			return new ReadableStream(underlyingSource);
		};
	}
}

/*
 * As LabelSelector of K8S API
 */
export type K8sSelector = {
	matchExpressions?: {
		key: string;
		operator: string;
		values: string[];
	}[];
	matchLabels?: Record<string, string>;
}

/*
 * This a selector type used to auto-generate info of DDU item.
 */
export type SelectorItem = {
	selector?: K8sSelector;
}

/*
 * Used for defining parameters for the source.
 */
export type CommonParams = BaseParams & {
	context?: string;
	namespace?: string;
	selector?: string;
	show_detail: boolean;
};

/*
 * Used for common properties for Item.data and Item.action.
 *
 * Maps to "ObjectMeta" of K8S API.
 */
export type CommonMeta = {
	context?: string;
	namespace: string;
	uid: string;
	shortUid: string;
	kind: string;
	name: string;
	creationTimestamp: string;
	age: string;
	labels: Record<string, string>;
	annotations: Record<string, string>;
	resourceVersion: string;
	ownerReferences: {
		uid: string
		kind: string;
		name: string;
	}[];
};

/*
 * Used for default value of Params.
 */
export const DefaultCommonParams: CommonParams = {
	show_detail: false,
}

/*
 * Partial properties of ItemHighlight
 */
export type DisplayHighlight = {
	name: string;
	hl_group: string;
};

/*
 * Definitions of highlights for components
 *
 * key - The index of display component
 * value - The highlight specification
 */
export type HighlightsOfComponent = Record<number, DisplayHighlight>;

/*
 * By defined HighlightsOfComponent,
 * this function builds ItemHighlights for the given displayComponents and highlightsOfComponent.
 */
export async function buildItemHighlights(
	denops: Denops,
	displayComponents: string[],
	highlightsOfComponent: HighlightsOfComponent
): Promise<ItemHighlight[]> {
	const highlights: ItemHighlight[] = [];

	let currentCol = 1;
	for (const [index, part] of displayComponents.entries()) {
		const currentWidth = await strlen(denops, part);

		if (highlightsOfComponent[index]) {
			const { hl_group, name } = highlightsOfComponent[index];
			highlights.push({
				name,
				hl_group,
				col: currentCol, width: currentWidth,
			});
		}

		currentCol += currentWidth + 1;
	}

	return Promise.resolve(highlights);
}

export function CommonActions<P extends Record<string, undefined>>(
	objectType: string,
): Actions<P> {
	return {
		'open': {
			description: `Open the content of "${objectType}" object as YAML`,
			callback: async (
				args : ActionArguments<P>
			) : Promise<ActionFlags> => {
				const denops = args.denops;

				let namespacePath = "";
				if (args.sourceParams.namespace) {
					namespacePath = `${args.sourceParams.namespace}.ns/`;
				}

				await ensure(denops, args.context.bufNr, async () => {
					const metaInfo = args.items[0].action as CommonMeta;

					await denops.cmd(`edit dduk8s://${namespacePath}${metaInfo.kind}/${metaInfo.name}`);
				});

				return Promise.resolve(ActionFlags.None);
			}
		},
		'insert': {
			description: `Insert name of "${objectType}" object to buffer of context`,
			callback: (
				args : ActionArguments<P>
			) : Promise<ActionFlags> => {
				putTextBy(args, TypeOfPutText.INSERT,
					item => (item.action as CommonMeta).name
				);

				return Promise.resolve(ActionFlags.None);
			}
		},
		'append': {
			description: `Append name of "${objectType}" object to buffer of context`,
			callback: (
				args : ActionArguments<P>
			) : Promise<ActionFlags> => {
				putTextBy(args, TypeOfPutText.APPEND,
					item => (item.action as CommonMeta).name
				);

				return Promise.resolve(ActionFlags.None);
			}
		},
		'yank': {
			description: `Yank name of selected "${objectType}" object`,
			callback: async (
				args : ActionArguments<P>
			) : Promise<ActionFlags> => {
				const grabName = (item: DduItem) => (item.action as CommonMeta).name;

				await yankBy(args, grabName)
					.then(_ => {
						console.log(`Have yanked [${args.items.length}] namespaces`);
					});

				return ActionFlags.None;
			}
		},
		'yank-get': {
			description: `Yank command(with argument) of getting "${objectType}" object by kubectl`,
			callback: async (
				args : ActionArguments<P>
			) : Promise<ActionFlags> => {
				const commandAndArgs = _buildKubectlCmdBase(args);

				const commandBuilder = (item: DduItem): string => {
					const metaInfo = item.action as CommonMeta;
					const finalCommandAndArgs = [...commandAndArgs];
					finalCommandAndArgs.push('get', `${metaInfo.kind}/${metaInfo.name}`);
					return finalCommandAndArgs.join(' ');
				};

				await yankBy(args, commandBuilder)
					.then(_ => {
						console.log("Have yanked command(kubectl get) of namespace");
					});

				return ActionFlags.None;
			}
		},
		'yank-describe': {
			description: `Yank command(with argument) of describing "${objectType}" object by kubectl`,
			callback: async (
				args : ActionArguments<P>
			) : Promise<ActionFlags> => {
				const commandAndArgs = _buildKubectlCmdBase(args);
				const commandBuilder = (item: DduItem): string => {
					const metaInfo = item.action as CommonMeta;
					const finalCommandAndArgs = [...commandAndArgs];
					finalCommandAndArgs.push('describe', `${metaInfo.kind}/${metaInfo.name}`);
					return finalCommandAndArgs.join(' ');
				};

				await yankBy(args, commandBuilder)
					.then(_ => {
						console.log("Have yanked command(kubectl describe) of namespace");
					});

				return ActionFlags.None;
			}
		},
		'yank-uid': {
			description: `Yank UIDs of selected "${objectType}" object`,
			callback: async (
				args : ActionArguments<P>
			) : Promise<ActionFlags> => {
				const grabUid = (item: DduItem) => (item.action as CommonMeta).uid;

				await yankBy(args, grabUid)
					.then(_ => {
						console.log(`Have yanked [${args.items.length}] UIDs of namespace`);
					});

				return ActionFlags.None;
			}
		},
	}
}

function _buildKubectlCmdBase(args: ActionArguments<Record<string, undefined>>): string[] {
	const commandAndArgs = [
		'kubectl'
	];

	const params = args.sourceParams as CommonParams;
	if (params.context) {
		commandAndArgs.push('--context', params.context);
	}
	if (params.namespace) {
		commandAndArgs.push('--namespace', params.namespace);
	}

	return commandAndArgs
}

export type GetPreviewerFunc = (args: {
	denops: Denops;
	item: DduItem;
	actionParams: BaseParams;
	previewContext: PreviewContext;
}) => Promise<Previewer | undefined>

/*
 * Uses "kubectl get ..." to build Previewer of DDU
 */
export function buildPreviewer(): GetPreviewerFunc {
	return async (args: {
		denops: Denops;
		item: DduItem;
		actionParams: BaseParams;
		previewContext: PreviewContext;
	}): Promise<Previewer | undefined> => {
		const action = args.item.action as CommonMeta;
		if (!action) {
			return Promise.resolve(undefined);
		}

		const metaInfo = args.item.data as CommonMeta;

		const cmdArgs: string[] = [];
		if (action.context) {
			cmdArgs.push("--context", action.context);
		}
		if (action.namespace) {
			cmdArgs.push("--namespace", action.namespace);
		}

		cmdArgs.push("get", metaInfo.kind, metaInfo.name, "-o", "yaml");

		const command = new Deno.Command(
			'kubectl',
			{
				args: cmdArgs,
				stdout: "piped",
				stderr: "piped",
			}
		)

		/*
		 * Processes the exeuction result
		 */
		const output = await command.output();
		if (output.code !== 0) {
			const stderrText = new TextDecoder().decode(output.stderr);
			const errorMessage = `kubectl get(${metaInfo.kind}/${metaInfo.name}) has error[${output.code}]: ${stderrText}`;

			console.error(errorMessage);
			return Promise.resolve(undefined);
		}
		// :~)

		const contents = new TextDecoder().decode(output.stdout).split("\n");

		return Promise.resolve({
			kind: "nofile",
			filetype: 'yaml',
			syntax: 'yaml',
			contents: contents,
		});
	};
}

/*
 * Builds a bunch of ItemInfo for displaying detail of a K8S resouce.
 */
function _buildResourceInfo<P extends CommonParams, T extends CommonMeta>(params: P, item: T, theme: K8sTheme): ItemInfo[] {
	if (!params.show_detail) {
		return [];
	}

	const infoOfItem: ItemInfo[] = [];

	if ("selector" in item && item.selector) {
		infoOfItem.push(...buildInfoOfSelector(item.selector as K8sSelector, theme));
	}

	infoOfItem.push({
		text: `\t${theme.icons.creation_timestamp} ${item.creationTimestamp} (${item.uid})`,
		hl_group: theme.hl_groups.creation_timestamp,
	})
	for (const labelKey in item.labels) {
		infoOfItem.push({
			text: `\t${theme.icons.label} ${labelKey} 󰁔 ${item.labels[labelKey]}`,
			hl_group: theme.hl_groups.label,
		});
	}
	for (const annotationKey in item.annotations) {
		infoOfItem.push({
			text: `\t${theme.icons.annotation} ${annotationKey} 󰁔 ${item.annotations[annotationKey]}`,
			hl_group: theme.hl_groups.annotation,
		});
	}
	for (const owner of item.ownerReferences) {
		infoOfItem.push({
			text: `\t${theme.icons.owner_reference} ${owner.name}(${owner.kind}) (${owner.uid.slice(0, 9)}...)`,
			hl_group: theme.hl_groups.owner_reference,
		});
	}

	return infoOfItem;
}

/*
 * Builds ItemInfo for selector(by label)
 */
export function buildInfoOfSelector(
	selector: K8sSelector,
	theme: K8sTheme,
): ItemInfo[] {
	const infoList: ItemInfo[] = [];

	for (const [key, value] of Object.entries(selector.matchLabels ?? [])) {
		infoList.push({
			text: `\t${theme.icons.selector_match_label} ${key}  ${value}`,
			hl_group: theme.hl_groups.selector_match_expr,
		});
	}

	for (const expr of selector.matchExpressions ?? []) {
		infoList.push({
			text: `\t${theme.icons.selector_match_expr} ${expr.key} ${expr.operator}  ${expr.values.join(", ")}`,
			hl_group: theme.hl_groups.selector_match_expr,
		})
	}

	return infoList;
}

type K8sObjectBase = {
	kind: string,
	metadata: CommonMeta,
}

/*
 * Converts the output JSON("ObjectMeta") of kubectl to CommonMeta.
 */
export function distillMeta<T extends CommonMeta>(
	itemFromKubectl: K8sObjectBase,
	context?: string,
): T {
	const newMeta = {
		context: context,
		namespace: itemFromKubectl.metadata.namespace,
		kind: itemFromKubectl.kind.toLowerCase(),
		uid: itemFromKubectl.metadata.uid,
		shortUid: itemFromKubectl.metadata.uid.slice(0, 9),
		name: itemFromKubectl.metadata.name,
		creationTimestamp: itemFromKubectl.metadata.creationTimestamp,
		age: twas(itemFromKubectl.metadata.creationTimestamp),
		labels: itemFromKubectl.metadata.labels,
		annotations: itemFromKubectl.metadata.annotations,
		resourceVersion: itemFromKubectl.metadata.resourceVersion,
	} as T;

	newMeta.ownerReferences = [];
	if (itemFromKubectl.metadata.ownerReferences) {
		for (const owner of itemFromKubectl.metadata.ownerReferences) {
			newMeta.ownerReferences.push({
				uid: owner.uid,
				kind: owner.kind,
				name: owner.name,
			});
		}
	}

	return newMeta;
}

export function buildKubectlCmd<P extends CommonParams>(
	params: P,
	args: string[]
): Deno.Command {
	const cmdArgs = [ ...args ];

	if (params.namespace) {
		cmdArgs.unshift('--namespace', params.namespace);
	}
	if (params.context) {
		cmdArgs.unshift('--context', params.context);
	}
	if (params.selector) {
		cmdArgs.push('-l', params.selector);
	}

	return new Deno.Command(
		'kubectl',
		{
			args: cmdArgs,
			stdout: 'piped',
			stderr: 'piped',
		}
	);
}

export function checkErrorOfProcess(
	proc: Deno.ChildProcess,
	message: string
): Promise<void | never[]> {
	return proc.status
		.then(async status => {
			if (!status.success) {
				const stderrText = await toText(proc.stderr);
				const errorMessage = `Failed to execute 'kubectl' command[${message}/${status.code}]: ${stderrText}`;
				console.error(errorMessage);
				return Promise.resolve([]);
			}

			proc.stderr.cancel();
		});
}

/*
 * Used for yanking operator
 */
export enum TypeOfPutText {
	INSERT, APPEND
}

export async function yankBy(
	args: ActionArguments<BaseParams>,
	grabText: (item: DduItem) => string,
): Promise<void> {
	const pastedText = args.items.map(grabText)
		.join('\n');
	const registerName = await args.denops.eval('v:register');

	await args.denops.call(
		'setreg', '"', pastedText, 'c'
	);
	await args.denops.call('setreg', registerName, pastedText, 'c');
}

export async function putTextBy(
	args: ActionArguments<BaseParams>,
	putType: TypeOfPutText,
	grabText: (item: DduItem) => string,
): Promise<void> {
	const denops = args.denops;

	for (const item of args.items) {
		await ensure(denops, args.context.bufNr, async () => {
			const text = grabText(item);
			await putText(denops, args.context, putType, text);
		});
	}
}

export async function putText(
	denops: Denops, context: Context,
	type: TypeOfPutText, text: string
): Promise<void> {
	const pasteKey = type === TypeOfPutText.INSERT ? "P" : "p";
	const oldReg = await getreginfo(denops, '"');

	await setreg(denops, '"', text, "v");

	try {
		await denops.cmd('normal! ""' + pasteKey);
	} finally {
		await setreg(denops, '"', oldReg);
	}

	if (context.mode === "i") {
		// Cursor move
		const textLen = await strlen(denops, text);
		await cursor(denops, 0, await col(denops, ".") + textLen);
	}

	// Open folds
	await denops.cmd("normal! zv");
}
