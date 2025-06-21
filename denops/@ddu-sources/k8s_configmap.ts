import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";

export type Params = k8s_common.CommonParams;

type K8sConfigMapInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	binaryData?: Record<string, string>;
	data?: Record<string, string>;
}

export type ConfigMapInfo = k8s_common.CommonMeta & {
	numberOfData: number;
	numberOfBinaryData: number;
}

export class Source extends BaseSource<Params, ConfigMapInfo> {
	override kind = "k8s_configmap";

	override gather = new k8s_common.ItemFactory("configMap")
		.buildGather(new ConfigMapWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

class ConfigMapWorker implements k8s_common.K8sObjectToDduItemWorker<K8sConfigMapInfo, ConfigMapInfo, Params> {
	itemAttrWorker = ConfigMapAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		source: K8sConfigMapInfo,
		actionData: ConfigMapInfo
	): Promise<void>
	{
		actionData.numberOfData = source.data ? Object.keys(source.data).length : 0;
		actionData.numberOfBinaryData = source.binaryData ? Object.keys(source.binaryData).length : 0;

		return Promise.resolve();
	}
}

class ConfigMapAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: ConfigMapInfo;

	constructor(_args: GatherArguments<Params>, actionData: ConfigMapInfo)
	{
		// this.args = args;
		this.actionData = actionData;
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		const numberOfDataText = ` ${this.actionData.numberOfData}`;

		let numberOfBinaryDataText = "";
		if (this.actionData.numberOfBinaryData > 0) {
			numberOfBinaryDataText = `  ${this.actionData.numberOfBinaryData}`;
		}

		return Promise.resolve([
			`${theme.icons.prefix} `,
			this.actionData.name,
			`${numberOfDataText}${numberOfBinaryDataText} (${this.actionData.age})`,
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
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon, },
			2: { name: "k8s-configmap-info", hl_group: theme.hl_groups.l1_info, },
			3: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			4: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}

	info(commonInfo: ItemInfo[], _theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		return Promise.resolve(commonInfo);
	}
}
