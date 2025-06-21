import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";

export type Params = k8s_common.CommonParams;

type ReplicaSetStatus = {
	readyReplicas: number;
	availableReplicas: number;
}

type K8sReplicaSetInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	spec: {
		replicas: number;
		selector: k8s_common.K8sSelector;
	};
	status: ReplicaSetStatus;
}

// The ReplicaSet information used in DDU
export type ReplicaSetInfo = k8s_common.CommonMeta & k8s_common.SelectorItem & {
	replicas: number;
	status: ReplicaSetStatus;
};

export class Source extends BaseSource<Params> {
	override kind = "k8s_replicaset";

	override gather = new k8s_common.ItemFactory("replicaSet")
		.buildGather(new ReplicaSetWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

class ReplicaSetWorker implements k8s_common.K8sObjectToDduItemWorker<K8sReplicaSetInfo, ReplicaSetInfo, Params> {
	itemAttrWorker = ReplicaSetAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		source: K8sReplicaSetInfo,
		actionData: ReplicaSetInfo
	): Promise<void>
	{
		actionData.replicas = source.spec.replicas;
		actionData.selector = source.spec.selector;
		actionData.status = {
			readyReplicas: source.status.readyReplicas,
			availableReplicas: source.status.availableReplicas,
		};

		return Promise.resolve();
	}
}

class ReplicaSetAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: ReplicaSetInfo;
	private readonly replicaSetStatus: ReplicaSetStatus;

	constructor(_args: GatherArguments<Params>, actionData: ReplicaSetInfo)
	{
		// this.args = args;
		this.actionData = actionData;
		this.replicaSetStatus = actionData.status;
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		return Promise.resolve([
			`${theme.icons.prefix} `,
			this.actionData.name,
			`󰲷 ${this.replicaSetStatus.readyReplicas}/${this.actionData.replicas}  ${this.replicaSetStatus.availableReplicas} (${this.actionData.age})`,
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
			2: { name: "k8s-replicaSet-replica-status", hl_group: theme.hl_groups.l1_info, },
			3: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			4: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}

	info(commonInfo: ItemInfo[], _theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		return Promise.resolve(commonInfo);
	}
}
