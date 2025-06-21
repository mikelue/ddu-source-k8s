import type { Item, BaseParams } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import { TextLineStream } from "jsr:@std/streams";
import * as k8s_common from "../common.ts";

export type Params = BaseParams & {
	kubeconfig?: string;
}

export type ContextInfo = {
	is_current: boolean;
	name: string;
	cluster: string;
	authinfo: string;
	namespace: string;
}

type ActionData = ContextInfo;

export class Source extends BaseSource<Params, ActionData> {
	override kind = "k8s_context";
	override gather(args: GatherArguments<Params>): ReadableStream<Item<ActionData>[]>
	{
		const underlyingSource = {
			async start(controller: ReadableStreamDefaultController) {
				const commits = await _loadContexts(args);

				controller.enqueue(commits);
				controller.close();
			}
		}

		return new ReadableStream(underlyingSource);
	}

	override params(): Params {
		return {};
    }
}

/*
 * process the output of command `kubectl config get-contextes`
 *
 * e.g.
 * CURRENT   NAME           CLUSTER        AUTHINFO       NAMESPACE
 * *         mike-sandbox   mike-sandbox   mike-sandbox
 *           minikube       minikube       minikube       default
 */
export async function _loadContexts(args: GatherArguments<Params>) : Promise<Item<ActionData>[]>
{
	const cmdArgs = [ 'config', 'get-contexts', '--no-headers=true' ];

	if (args.sourceParams.kubeconfig) {
		cmdArgs.unshift('--kubeconfig', args.sourceParams.kubeconfig);
	}

	const proc = new Deno.Command(
		'kubectl',
		{
			args: cmdArgs,
			stdout: 'piped',
			stderr: 'piped',
		}
	)
		.spawn();

	k8s_common.checkErrorOfProcess(proc, `${cmdArgs[0]} ${cmdArgs[1]}`);

	const streamOfLines = proc.stdout
		.pipeThrough(new TextDecoderStream())
		.pipeThrough(new TextLineStream());

	const items: Promise<Item<ActionData>>[] = [];

	for await (const line of streamOfLines) {
		const columns = line.trim().split(/\s+/);
		const newContextInfo: ActionData = {
			is_current: false,
			name: "",
			cluster: "",
			authinfo: "",
			namespace: "",
		};

		let startIndexBesideCurrent = 0;
		if (columns[0] === '*') {
			newContextInfo.is_current = true;
			startIndexBesideCurrent = 1;
		}

		newContextInfo.name = columns[startIndexBesideCurrent];
		newContextInfo.cluster = columns[startIndexBesideCurrent + 1];
		newContextInfo.authinfo = columns[startIndexBesideCurrent + 2];

		if (columns.length === 4 && !newContextInfo.is_current) {
			newContextInfo.namespace = columns[3];
		} else if (columns.length === 5) {
			newContextInfo.namespace = columns[4];
		}

		items.push(toItem(args, newContextInfo));
	}

	return Promise.all(items);
}

async function toItem(args: GatherArguments<Params>, contextInfo: ActionData): Promise<Item<ActionData>> {
	const theme = await k8s_common.grabThemeConfig(args.denops)
	const displayComponents = [
		' ',
		contextInfo.is_current ? "󰋱" : " ",
		contextInfo.name,
		contextInfo.namespace ? `󱂀 ${contextInfo.namespace}` : "󱂀 <N/A>",
		`(󰒍 ${contextInfo.cluster} 󰦝 ${contextInfo.authinfo})`,
	];

	const highlights = await k8s_common.buildItemHighlights(
		args.denops, displayComponents,
		{
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon },
			1: { name: "k8s-active", hl_group: theme.hl_groups.l1_info },
			3: { name: "k8s-namespace", hl_group: theme.hl_groups.l2_info },
			4: { name: "k8s-cluster-auth-info", hl_group: theme.hl_groups.creation_timestamp },
		}
	);

	return {
		word: ` ${contextInfo.name}/${contextInfo.cluster}/${contextInfo.authinfo}`,
		display: displayComponents.join(" "),
		data: contextInfo,
		highlights: highlights,
		action: contextInfo,
	};
}
