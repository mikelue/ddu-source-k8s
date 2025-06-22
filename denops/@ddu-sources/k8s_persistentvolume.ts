import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";

export type Params = k8s_common.CommonParams;

type K8sPersistentVolumeInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	spec: {
		accessModes: string[];
		capacity?: {
			storage?: string;
		};
		persistentVolumeReclaimPolicy?: string;
		storageClassName?: string;
		claimRef?: k8s_common.K8sTargetRef;
	};
	status: {
		phase: string;
		reason?: string;
		message?: string;
	};
}

export type PersistentVolumeInfo = k8s_common.CommonMeta & {
	accessModes: string;
	status: string;
	capacity?: string;
	persistentVolumeReclaimPolicy?: string;
	storageClassName?: string;
	claimRef?: k8s_common.K8sTargetRef;
	reason?: string;
	message?: string;
}

export class Source extends BaseSource<Params, PersistentVolumeInfo> {
	override kind = "k8s_persistentvolume";

	override gather = new k8s_common.ItemFactory("persistentVolume")
		.buildGather(new PersistentVolumeWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

const UPPER_CASE_REGEX = /[A-Z]/g;
class PersistentVolumeWorker implements k8s_common.K8sObjectToDduItemWorker<K8sPersistentVolumeInfo, PersistentVolumeInfo, Params> {
	itemAttrWorker = PersistentVolumeAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		source: K8sPersistentVolumeInfo,
		actionData: PersistentVolumeInfo
	): Promise<void>
	{
		actionData.accessModes = source.spec.accessModes.map(
			s => [...s.matchAll(UPPER_CASE_REGEX)].join('')
		)
			.join(",");
		actionData.status = source.status.phase;
		actionData.capacity = source.spec.capacity?.storage ?? undefined;
		actionData.persistentVolumeReclaimPolicy = source.spec.persistentVolumeReclaimPolicy;
		actionData.storageClassName = source.spec.storageClassName;
		actionData.claimRef = source.spec.claimRef;
		actionData.reason = source.status.reason;
		actionData.message = source.status.message;

		return Promise.resolve();
	}
}

class PersistentVolumeAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: PersistentVolumeInfo;

	constructor(_args: GatherArguments<Params>, actionData: PersistentVolumeInfo)
	{
		// this.args = args;
		this.actionData = actionData;
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		const reason = this.actionData.reason ? ` 󰍢 [${this.actionData.reason}]` : "";
		const storageClass = this.actionData.storageClassName ? `  ${this.actionData.storageClassName}` : "";

		return Promise.resolve([
			`${theme.icons.prefix} `,
			this.actionData.name,
			` ${this.actionData.capacity ?? "<N/A>"}(${this.actionData.accessModes}/${this.actionData.persistentVolumeReclaimPolicy})${storageClass}`,
			` ${this.actionData.status}${reason} (${this.actionData.age})`,
			`(${theme.icons.resource_version} ${this.actionData.resourceVersion})`,
			`(${this.actionData.shortUid}...)`,
		]);
	}

	word(): Promise<string>
	{
		// Don't know why: matcher_fzf needs a empty character to match first part of word
		return Promise.resolve(
			` ${this.actionData.name}/${this.actionData.accessModes}/${this.actionData.status}/${this.actionData.reason} ${this.actionData.message}/${this.actionData.storageClassName}/${this.actionData.persistentVolumeReclaimPolicy}/${this.actionData.shortUid}/${this.actionData.age}`
		);
	}

	highlights(theme: k8s_common.K8sTheme): Promise<k8s_common.HighlightsOfComponent>
	{
		const statusHlGroup = this.actionData.reason ? theme.hl_groups.error : theme.hl_groups.l1_info;

		return Promise.resolve({
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon, },
			2: { name: "k8s-pv", hl_group: theme.hl_groups.l2_info, },
			3: { name: "k8s-pv-status", hl_group: statusHlGroup, },
			4: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			5: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}

	info(commonInfo: ItemInfo[], theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		const infoList: ItemInfo[] = [];

		if (this.actionData.message) {
			infoList.push({
				text: `\t󰍢 ${this.actionData.message}`,
				hl_group: theme.hl_groups.error,
			})
		}

		if (this.actionData.claimRef) {
			const claimRef = this.actionData.claimRef;

			infoList.push({
				text: `\t ${claimRef.name}(${claimRef.kind}) (${claimRef.uid.slice(0, 8)}...)`,
				hl_group: theme.hl_groups.l3_info,
			})
		}

		infoList.push(...commonInfo);

		return Promise.resolve(infoList);
	}
}
