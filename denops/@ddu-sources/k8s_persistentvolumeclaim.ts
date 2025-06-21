import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";

export type Params = k8s_common.CommonParams;

type K8sPersistentVolumeClaimInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	spec: {
		volumeName: string;
		accessModes: string[];
		resources?: {
			requests?: {
				storage?: string
			};
		};
		storageClassName?: string;
		selector?: k8s_common.K8sSelector
	};
	status: {
		phase: string;
	};
}

export type PersistentVolumeClaimInfo = k8s_common.CommonMeta & k8s_common.SelectorItem & {
	volumeName: string;
	accessModes: string;
	status: string;
	capacity?: string;
	storageClassName?: string;
}

export class Source extends BaseSource<Params, PersistentVolumeClaimInfo> {
	override kind = "k8s_persistentvolumeclaim";

	override gather = new k8s_common.ItemFactory("persistentVolumeClaim")
		.buildGather(new PersistentVolumeClaimWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

const UPPER_CASE_REGEX = /[A-Z]/g;
class PersistentVolumeClaimWorker implements k8s_common.K8sObjectToDduItemWorker<K8sPersistentVolumeClaimInfo, PersistentVolumeClaimInfo, Params> {
	itemAttrWorker = PersistentVolumeClaimAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		source: K8sPersistentVolumeClaimInfo,
		actionData: PersistentVolumeClaimInfo
	): Promise<void>
	{
		actionData.volumeName = source.spec.volumeName;
		actionData.accessModes = source.spec.accessModes.map(
			s => [...s.matchAll(UPPER_CASE_REGEX)].join('')
		)
			.join(",");
		actionData.status = source.status.phase;
		actionData.capacity = source.spec.resources?.requests?.storage ?? undefined;
		actionData.storageClassName = source.spec.storageClassName;
		actionData.selector = source.spec.selector;

		return Promise.resolve();
	}
}

class PersistentVolumeClaimAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: PersistentVolumeClaimInfo;

	constructor(_args: GatherArguments<Params>, actionData: PersistentVolumeClaimInfo)
	{
		// this.args = args;
		this.actionData = actionData;
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		const storageClass = this.actionData.storageClassName ?
			`  ${this.actionData.storageClassName}(${this.actionData.volumeName})` :
			`  ${this.actionData.volumeName}`;

		return Promise.resolve([
			`${theme.icons.prefix} `,
			this.actionData.name,
			` ${this.actionData.capacity ?? "<N/A>"}(${this.actionData.accessModes})${storageClass}`,
			` ${this.actionData.status} (${this.actionData.age})`,
			`(${theme.icons.resource_version} ${this.actionData.resourceVersion})`,
			`(${this.actionData.shortUid}...)`,
		]);
	}

	word(): Promise<string>
	{
		// Don't know why: matcher_fzf needs a empty character to match first part of word
		return Promise.resolve(
			` ${this.actionData.name}/${this.actionData.accessModes}/${this.actionData.status}/${this.actionData.volumeName}/${this.actionData.storageClassName}/${this.actionData.shortUid}/${this.actionData.age}`
		);
	}

	highlights(theme: k8s_common.K8sTheme): Promise<k8s_common.HighlightsOfComponent>
	{
		return Promise.resolve({
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon, },
			2: { name: "k8s-pvc", hl_group: theme.hl_groups.l2_info, },
			3: { name: "k8s-pvc-status", hl_group: theme.hl_groups.l1_info, },
			4: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			5: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}

	info(commonInfo: ItemInfo[], _theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		return Promise.resolve(commonInfo);
	}
}
