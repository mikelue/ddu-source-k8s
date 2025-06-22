import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";

export type Params = k8s_common.CommonParams;

type StatefulSetStatus = {
	readyReplicas: number;
	availableReplicas: number;
	updatedReplicas?: number;
}

type K8sStatefulSetInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	spec: {
		serviceName: string;
		replicas: number;
		selector: k8s_common.K8sSelector;
	};
	status: StatefulSetStatus;
}

// The StatefulSet information used in DDU
export type StatefulSetInfo = k8s_common.CommonMeta & k8s_common.SelectorItem & {
	serviceName: string;
	replicas: number;
	status: StatefulSetStatus;
};

export class Source extends BaseSource<Params> {
	override kind = "k8s_statefulset";

	override gather = new k8s_common.ItemFactory("statefulSet")
		.buildGather(new StatefulSetWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

class StatefulSetWorker implements k8s_common.K8sObjectToDduItemWorker<K8sStatefulSetInfo, StatefulSetInfo, Params> {
	itemAttrWorker = StatefulSetAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		source: K8sStatefulSetInfo,
		actionData: StatefulSetInfo
	): Promise<void>
	{
		actionData.serviceName = source.spec.serviceName;
		actionData.replicas = source.spec.replicas;
		actionData.selector = source.spec.selector;
		actionData.status = {
			readyReplicas: source.status.readyReplicas,
			availableReplicas: source.status.availableReplicas,
			updatedReplicas: source.status.updatedReplicas,
		};

		return Promise.resolve();
	}
}

class StatefulSetAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: StatefulSetInfo;

	constructor(_args: GatherArguments<Params>, actionData: StatefulSetInfo)
	{
		// this.args = args;
		this.actionData = actionData;
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		const statefulSetStatus = this.actionData.status;

		return Promise.resolve([
			`${theme.icons.prefix} `,
			this.actionData.name,
			`${this.actionData.name} (${this.actionData.serviceName})`,
			`󰲷 ${statefulSetStatus.readyReplicas}/${this.actionData.replicas}  ${statefulSetStatus.updatedReplicas ?? "<N/A>"}  ${statefulSetStatus.availableReplicas} (${this.actionData.age})`,
			`(${theme.icons.resource_version} ${this.actionData.resourceVersion})`,
			`(${this.actionData.shortUid}...)`,
		]);
	}

	word(): Promise<string>
	{
		// Don't know why: matcher_fzf needs a empty character to match first part of word
		return Promise.resolve(
			` ${this.actionData.name}/${this.actionData.serviceName}/${this.actionData.shortUid}/${this.actionData.age}`
		);
	}

	highlights(theme: k8s_common.K8sTheme): Promise<k8s_common.HighlightsOfComponent>
	{
		return Promise.resolve({
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon, },
			2: { name: "k8s-statefulSet-replica-status", hl_group: theme.hl_groups.l1_info, },
			3: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			4: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}

	info(commonInfo: ItemInfo[], _theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		return Promise.resolve(commonInfo);
	}
}
