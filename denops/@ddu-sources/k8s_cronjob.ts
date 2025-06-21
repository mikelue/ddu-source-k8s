import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";
import { twas } from "jsr:@augustinmauroy/twas";

export type Params = k8s_common.CommonParams;

type CronJobStatus = {
	lastScheduleTime?: string;
	lastSuccessfulTime?: string;
}

type K8sCronJobInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	spec: {
		schedule: string;
		suspend: boolean;
		timeZone?: string;
	};
	status: CronJobStatus;
}

// The CronJob information used in DDU
export type CronJobInfo = k8s_common.CommonMeta & {
	schedule: string;
	suspend: boolean;
	timeZone?: string;
	status: CronJobStatus;
};

export class Source extends BaseSource<Params> {
	override kind = "k8s_cronjob";

	override gather = new k8s_common.ItemFactory("cronjob")
		.buildGather(new CronJobWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

class CronJobWorker implements k8s_common.K8sObjectToDduItemWorker<K8sCronJobInfo, CronJobInfo, Params> {
	itemAttrWorker = CronJobAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		source: K8sCronJobInfo,
		cronJobInfo: CronJobInfo
	): Promise<void>
	{
		cronJobInfo.schedule = source.spec.schedule;
		cronJobInfo.suspend = source.spec.suspend;
		cronJobInfo.timeZone = source.spec.timeZone;
		cronJobInfo.status = {
			lastScheduleTime: source.status.lastScheduleTime,
			lastSuccessfulTime: source.status.lastSuccessfulTime,
		};

		return Promise.resolve();
	}
}

class CronJobAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: CronJobInfo;
	private readonly cronJobStatus: CronJobStatus;

	constructor(_args: GatherArguments<Params>, actionData: CronJobInfo)
	{
		// this.args = args;
		this.actionData = actionData;
		this.cronJobStatus = actionData.status;
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		let suspendIcon = "";
		if (this.actionData.suspend) {
			suspendIcon = " 󰅜";
		}

		let lastScheduleTimeText = "";
		if (this.cronJobStatus.lastScheduleTime) {
			lastScheduleTimeText = ` 󱦻 ${twas(this.cronJobStatus.lastScheduleTime)}`;
		}

		let lastSuccessfulTimeText = "";
		if (this.cronJobStatus.lastSuccessfulTime) {
			lastSuccessfulTimeText = ` 󰾩 ${twas(this.cronJobStatus.lastSuccessfulTime)}`;
		}

		let timeZoneText = "";
		if (this.actionData.timeZone) {
			timeZoneText = ` (${this.actionData.timeZone})`;
		}

		return Promise.resolve([
			`${theme.icons.prefix} ${suspendIcon}`,
			this.actionData.name,
			` [${this.actionData.schedule}]${timeZoneText}`,
			`${lastScheduleTimeText}${lastSuccessfulTimeText} (󰼽 ${this.actionData.age})`,
			`(${theme.icons.resource_version} ${this.actionData.resourceVersion})`,
			`(${this.actionData.shortUid}...)`,
		]);
	}

	word(): Promise<string>
	{
		// Don't know why: matcher_fzf needs a empty character to match first part of word
		return Promise.resolve(
			` ${this.actionData.name}/${this.actionData.schedule}/${this.actionData.shortUid}/${this.actionData.age}`
		);
	}

	highlights(theme: k8s_common.K8sTheme): Promise<k8s_common.HighlightsOfComponent>
	{
		return Promise.resolve({
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon, },
			2: { name: "k8s-cronJob-schedule", hl_group: theme.hl_groups.l1_info, },
			3: { name: "k8s-cronJob-status", hl_group: theme.hl_groups.l2_info, },
			4: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			5: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}

	info(commonInfo: ItemInfo[], _theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		return Promise.resolve(commonInfo);
	}
}
