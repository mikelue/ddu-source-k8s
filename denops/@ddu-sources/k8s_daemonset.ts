import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";

export type Params = k8s_common.CommonParams;

type DaemonSetStatus = {
	numberReady: number;
	desiredNumberScheduled: number;
	updatedNumberScheduled: number;
	currentNumberScheduled: number;
	numberAvailable: number;
}

type K8sDaemonSetInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	spec: {
		selector: k8s_common.K8sSelector;
	};
	status: DaemonSetStatus;
}

// The DaemonSet information used in DDU
export type DaemonSetInfo = k8s_common.CommonMeta & k8s_common.SelectorItem & {
	status: DaemonSetStatus;
};

export class Source extends BaseSource<Params> {
	override kind = "k8s_daemonset";

	override gather = new k8s_common.ItemFactory("daemonset")
		.buildGather(new DaemonSetWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

class DaemonSetWorker implements k8s_common.K8sObjectToDduItemWorker<K8sDaemonSetInfo, DaemonSetInfo, Params> {
	itemAttrWorker = DaemonSetAttrWorker;

	toActionData(
		_args: GatherArguments<k8s_common.CommonParams>,
		source: K8sDaemonSetInfo,
		actionData: DaemonSetInfo
	) : Promise<void>
	{
		actionData.selector = source.spec.selector;
		actionData.status = {
			numberReady: source.status.numberReady,
			desiredNumberScheduled: source.status.desiredNumberScheduled,
			updatedNumberScheduled: source.status.updatedNumberScheduled,
			currentNumberScheduled: source.status.currentNumberScheduled,
			numberAvailable: source.status.numberAvailable,
		};

		return Promise.resolve();
	}
}

class DaemonSetAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: DaemonSetInfo;
	private readonly daemonSetStatus: DaemonSetStatus;

	constructor(_args: GatherArguments<Params>, actionData: DaemonSetInfo)
	{
		// this.args = args;
		this.actionData = actionData;
		this.daemonSetStatus = actionData.status;
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		return Promise.resolve([
			`${theme.icons.prefix} `,
			this.actionData.name,
			`󰲷 ${this.daemonSetStatus.numberReady}/${this.daemonSetStatus.desiredNumberScheduled}  ${this.daemonSetStatus.updatedNumberScheduled}  ${this.daemonSetStatus.currentNumberScheduled}/${this.daemonSetStatus.numberAvailable} (${this.actionData.age})`,
			`(${theme.icons.resource_version} ${this.actionData.resourceVersion})`,
			`(${this.actionData.shortUid}...)`,
		]);
	}
	word(): Promise<string>
	{
		return Promise.resolve(
			` ${this.actionData.name}/${this.actionData.shortUid}/${this.actionData.age}`
		);
	}
	highlights(theme: k8s_common.K8sTheme): Promise<k8s_common.HighlightsOfComponent>
	{
		return Promise.resolve({
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon, },
			2: { name: "k8s-daemonSet-replica-status", hl_group: theme.hl_groups.l1_info, },
			3: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			4: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}
	info(commonInfo: ItemInfo[], _theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		return Promise.resolve(commonInfo);
	}
}
