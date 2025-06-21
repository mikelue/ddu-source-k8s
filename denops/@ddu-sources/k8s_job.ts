import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";
import { twas } from "jsr:@augustinmauroy/twas";
import { Duration } from "jsr:@retraigo/duration";

export type Params = k8s_common.CommonParams;

type JobStatus = {
	startTime?: string;
	completionTime?: string;
	succeeded: number;
}

type K8sJobInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	spec: {
		completions: number;
		suspend: boolean;
	};
	status: JobStatus;
}

// The Job information used in DDU
export type JobInfo = k8s_common.CommonMeta & {
	completions: number;
	suspend: boolean;
	status: JobStatus;
};

export class Source extends BaseSource<Params> {
	override kind = "k8s_job";

	override gather = new k8s_common.ItemFactory("job")
		.buildGather(new JobWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

class JobWorker implements k8s_common.K8sObjectToDduItemWorker<K8sJobInfo, JobInfo, Params> {
	itemAttrWorker = JobAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		source: K8sJobInfo,
		actionData: JobInfo
	): Promise<void>
	{
		actionData.completions = source.spec.completions;
		actionData.suspend = source.spec.suspend;
		actionData.status = {
			startTime: source.status.startTime,
			completionTime: source.status.completionTime,
			succeeded: source.status.succeeded,
		};

		return Promise.resolve();
	}
}

class JobAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: JobInfo;
	private readonly jobStatus: JobStatus;
	private readonly durationText: string = "";

	constructor(_args: GatherArguments<Params>, actionData: JobInfo)
	{
		// this.args = args;
		this.actionData = actionData;
		this.jobStatus = actionData.status;

		if (this.jobStatus.startTime && this.jobStatus.completionTime) {
			const duration = new Duration(
				new Date(this.jobStatus.completionTime).getTime() -
				new Date(this.jobStatus.startTime).getTime()
			).toShortString(true);

			this.durationText = ` 󱛣 ${duration} [${twas(this.jobStatus.completionTime)}]`;
		}
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		let suspendIcon = "";
		if (this.actionData.suspend) {
			suspendIcon = " 󰅜";
		}

		return Promise.resolve([
			`${theme.icons.prefix} ${suspendIcon} `,
			this.actionData.name,
			` ${this.jobStatus.succeeded}/${this.actionData.completions}${this.durationText} (󰼽 ${this.actionData.age})`,
			`(${theme.icons.resource_version} ${this.actionData.resourceVersion})`,
			`(${this.actionData.shortUid}...)`,
		]);
	}

	word(): Promise<string>
	{
		// Don't know why: matcher_fzf needs a empty character to match first part of word
		return Promise.resolve(
			` ${this.actionData.name}/${this.durationText}/${this.actionData.shortUid}/${this.actionData.age}`
		);
	}

	highlights(theme: k8s_common.K8sTheme): Promise<k8s_common.HighlightsOfComponent>
	{
		return Promise.resolve({
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon, },
			2: { name: "k8s-job-schedule", hl_group: theme.hl_groups.l1_info, },
			3: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			4: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}

	info(commonInfo: ItemInfo[], theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		const infoList: ItemInfo[] = [];

		if (this.jobStatus.startTime) {
			infoList.push({
				text: `\t  Start: ${this.jobStatus.startTime}(${twas(this.jobStatus.startTime)})`,
				hl_group: theme.hl_groups.l2_info,
			})
		}
		if (this.jobStatus.completionTime) {
			infoList.push({
				text: `\t  Completion: ${this.jobStatus.completionTime}(${twas(this.jobStatus.completionTime)})`,
				hl_group: theme.hl_groups.l2_info,
			})
		}

		infoList.push(...commonInfo);

		return Promise.resolve(infoList);
	}
}
