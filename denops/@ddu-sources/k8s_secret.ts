import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";

export type Params = k8s_common.CommonParams;

type K8sSecretInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	data?: Record<string, string>;
	stringData?: Record<string, string>;
	immutable: boolean;
	type: string;
}

export type SecretInfo = k8s_common.CommonMeta & {
	numberOfData: number;
	numberOfStringData: number;
	immutable: boolean;
	type: string;
}

export class Source extends BaseSource<Params, SecretInfo> {
	override kind = "k8s_secret";

	override gather = new k8s_common.ItemFactory("secret")
		.buildGather(new SecretWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

class SecretWorker implements k8s_common.K8sObjectToDduItemWorker<K8sSecretInfo, SecretInfo, Params> {
	itemAttrWorker = SecretAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		source: K8sSecretInfo,
		actionData: SecretInfo
	): Promise<void>
	{
		actionData.numberOfData = source.data ? Object.keys(source.data).length : 0;
		actionData.numberOfStringData = source.stringData? Object.keys(source.stringData).length : 0;
		actionData.immutable = source.immutable;
		actionData.type = source.type;

		return Promise.resolve();
	}
}

class SecretAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: SecretInfo;

	constructor(_args: GatherArguments<Params>, actionData: SecretInfo)
	{
		// this.args = args;
		this.actionData = actionData;
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		const numberOfStringDataText = this.actionData.numberOfStringData > 0 ?
			` ${this.actionData.numberOfStringData}`: '';

		const prefixSpace = this.actionData.numberOfStringData > 0 ? ' ' : '';
		const numberOfDataText = this.actionData.numberOfData > 0 ?
			`${prefixSpace} ${this.actionData.numberOfData}` : '';

		const immutableIcon = this.actionData.immutable ? ' ' : '';

		return Promise.resolve([
			`${theme.icons.prefix}${immutableIcon} `,
			`${this.actionData.name}`,
			`${numberOfStringDataText}${numberOfDataText}(${this.actionData.type}) (${this.actionData.age})`,
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
			2: { name: "k8s-secret-data", hl_group: theme.hl_groups.l1_info, },
			3: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			4: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}

	info(commonInfo: ItemInfo[], _theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		return Promise.resolve(commonInfo);
	}
}
