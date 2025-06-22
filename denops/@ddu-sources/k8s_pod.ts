import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";
import { twas } from "jsr:@augustinmauroy/twas";

export type Params = k8s_common.CommonParams;

// The POD information(defined by K8S API)
type K8sPodInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	status: {
		containerStatuses: {
			name: string;
			ready: boolean;
			restartCount: number;
			resources: {
				limits?: Record<string, string>,
			};
			// deno-lint-ignore no-explicit-any
			state: Record<string, any>;
		}[];
		startTime: string;
		phase: string;
		hostIP: string;
		podIP: string;
	};
}

// The POD information used in DDU
export type PodInfo = k8s_common.CommonMeta & {
	startTime: Date;
	phase: string;
	containerStatuses: {
		readyCount: number;
		totalCount: number;
		restartCount: number;
		latestStartTime?: Date;
		waitingReason?: string;
		waitingMessage?: string;
	};
	containers: {
		name: string;
		limits?: Record<string, string>;
	}[],
	hostIP: string;
	podIP: string;
};

type ActionData = PodInfo;

export class Source extends BaseSource<Params, ActionData> {
	override kind = "k8s_pod";
	override gather = new k8s_common.ItemFactory("pod")
		.buildGather(new PodWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

class PodWorker implements k8s_common.K8sObjectToDduItemWorker<K8sPodInfo, PodInfo, Params> {
	itemAttrWorker = PodAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		source: K8sPodInfo,
		actionData: PodInfo
	): Promise<void>
	{
		actionData.startTime = new Date(source.status.startTime);
		actionData.phase = source.status.phase;
		actionData.hostIP = source.status.hostIP;
		actionData.podIP = source.status.podIP;
		actionData.containers = [];

		let readyCount = 0;
		let restartCount = 0;
		const totalCount = source.status.containerStatuses?.length ?? 0;
		let latestRestartTime: Date | undefined = undefined;
		let waitingReason: string | undefined = undefined;
		let waitingMessage: string | undefined = undefined;
		for (const containerStatus of source.status.containerStatuses) {
			if (containerStatus.ready) {
				readyCount++;
			}

			restartCount += containerStatus.restartCount;

			/*
			 * Processes the latest time of restarting
			 */
			const state = containerStatus.state;
			if ("running" in state) {
				latestRestartTime = new Date(state.running.startedAt);
			} else if ("terminated" in state) {
				latestRestartTime = new Date(state.terminated.startedAt);
			} else if ("waiting" in state) {
				waitingReason = state.waiting.reason;
				waitingMessage = state.waiting.message;
			}
			// :~)

			actionData.containers.push({
				name: containerStatus.name,
				limits: containerStatus.resources.limits,
			});
		}
		actionData.containerStatuses = {
			readyCount: readyCount,
			restartCount: restartCount,
			totalCount: totalCount,
			latestStartTime: latestRestartTime,
			waitingReason: waitingReason,
			waitingMessage: waitingMessage,
		};

		return Promise.resolve();
	}
}

class PodAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: PodInfo;
	private readonly relativeTimeOfLatestStart: string = "";
	private readonly waitingMessage: string = "";
	private readonly waitingReason: string = "";

	constructor(_args: GatherArguments<Params>, actionData: PodInfo)
	{
		// this.args = args;
		this.actionData = actionData;

		const containerStatuses = this.actionData.containerStatuses;
		if (containerStatuses.latestStartTime) {
			this.relativeTimeOfLatestStart = twas(containerStatuses.latestStartTime);
		}

		if (containerStatuses.waitingMessage) {
			this.waitingMessage = containerStatuses.waitingMessage;
		}

		if (containerStatuses.waitingReason) {
			this.waitingReason = containerStatuses.waitingReason ?? "";
		}
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		const containerStatuses = this.actionData.containerStatuses;

		let latestStartTimeText = "";
		if (this.relativeTimeOfLatestStart !== "") {
			latestStartTimeText = ` (󱫐 ${this.relativeTimeOfLatestStart})`;
		}

		let waitingReasonText = "";
		if (this.waitingReason !== "") {
			waitingReasonText = `󰾙 [${this.waitingReason}] `;
		}

		return Promise.resolve([
			`${theme.icons.prefix} `,
			this.actionData.name,
			`${waitingReasonText} ${this.actionData.phase}`,
			` ${containerStatuses.readyCount}/${containerStatuses.totalCount}  ${containerStatuses.restartCount}${latestStartTimeText}`,
			`󰩠 ${this.actionData.podIP} (${this.actionData.age})`,
			`(${theme.icons.resource_version} ${this.actionData.resourceVersion})`,
			`(${this.actionData.shortUid}...)`,
		]);
	}

	word(): Promise<string>
	{
		// Don't know why: matcher_fzf needs a empty character to match first part of word
		return Promise.resolve(
			` ${this.actionData.name}/${this.actionData.phase}/${this.waitingReason} ${this.waitingMessage}/${this.relativeTimeOfLatestStart}/${this.actionData.podIP}/${this.actionData.shortUid}/${this.actionData.age}`
		);
	}

	highlights(theme: k8s_common.K8sTheme): Promise<k8s_common.HighlightsOfComponent>
	{
		const phaseHlGroup = this.waitingReason === "" ?
			theme.hl_groups.l2_info : theme.hl_groups.error;

		return Promise.resolve({
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon, },
			2: { name: "k8s-phase", hl_group: phaseHlGroup, },
			3: { name: "k8s-counter", hl_group: theme.hl_groups.l3_info, },
			4: { name: "k8s-ip", hl_group: theme.hl_groups.creation_timestamp, },
			5: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			6: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}

	info(commonInfo: ItemInfo[], theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		const infoList: ItemInfo[] = [];

		if (this.waitingMessage !== "") {
			infoList.push({
				text: `\t󰾙 ${this.waitingMessage}`,
				hl_group: theme.hl_groups.error,
			});
		}

		infoList.push({
			text: `\t ${this.actionData.hostIP}`,
			hl_group: theme.hl_groups.l2_info,
		});

		for (const container of this.actionData.containers) {
			if (container.limits) {
				for (const [key, value] of Object.entries(container.limits)) {
					infoList.push({
						text: `\t\t󱤸 ${container.name}  ${key}/${value}`,
						hl_group: theme.hl_groups.l3_info,
					});
				}
			}
		}

		infoList.push(...commonInfo);

		return Promise.resolve(infoList);
	}
}
