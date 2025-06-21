import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";

export type Params = k8s_common.CommonParams;

type K8sNamespaceInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
}

export type NamespaceInfo = k8s_common.CommonMeta;

type ActionData = NamespaceInfo;

export class Source extends BaseSource<Params, ActionData> {
	override kind = "k8s_namespace";

	override gather = new k8s_common.ItemFactory("namespace")
		.buildGather(new NamespaceWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

class NamespaceWorker implements k8s_common.K8sObjectToDduItemWorker<K8sNamespaceInfo, NamespaceInfo, Params> {
	itemAttrWorker = NamespaceAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		_source: K8sNamespaceInfo,
		_actionData: NamespaceInfo
	): Promise<void>
	{
		return Promise.resolve();
	}
}

class NamespaceAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: NamespaceInfo;

	constructor(_args: GatherArguments<Params>, actionData: NamespaceInfo)
	{
		// this.args = args;
		this.actionData = actionData;
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		return Promise.resolve([
			`${theme.icons.prefix} `,
			this.actionData.name,
			`(${theme.icons.resource_version} ${this.actionData.resourceVersion})`,
			`(${this.actionData.shortUid}...)`,
		]);
	}

	word(): Promise<string>
	{
		// Don't know why: matcher_fzf needs a empty character to match first part of word
		return Promise.resolve(
			` ${this.actionData.name}/${this.actionData.shortUid}/${this.actionData.age}`
		);
	}

	highlights(theme: k8s_common.K8sTheme): Promise<k8s_common.HighlightsOfComponent>
	{
		return Promise.resolve({
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon },
			2: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version },
			3: { name: "k8s-uid", hl_group: theme.hl_groups.uid },
		})
	}

	info(commonInfo: ItemInfo[], _theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		return Promise.resolve(commonInfo);
	}
}
