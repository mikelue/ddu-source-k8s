import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";
import * as bytes from "npm:bytes";

export type Params = k8s_common.CommonParams;

type K8sNodeStatus = {
	addresses: {
		address: string;
		type: string;
	}[];
	capacity: Record<string, string>;
	nodeInfo: {
		kernelVersion: string;
		kubeletVersion: string;
	}
}


type K8sNodeInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	spec: {
		podCIDR: string;
	};
	status: K8sNodeStatus & {
		conditions: {
			status: string;
			type: string;
			message?: string;
			reason?: string;
		}[]
	};
}

export type NodeInfo = k8s_common.CommonMeta & {
	podCIDR: string;
	status: K8sNodeStatus;
	role: string;
	ready: boolean;
	readyMessage?: string;
	readyReason?: string;
}

export class Source extends BaseSource<Params, NodeInfo> {
	override kind = "k8s_node";

	override gather = new k8s_common.ItemFactory("node")
		.buildGather(new NodeWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

const REGEXP_ROLE_LABEL = /^node-role.kubernetes.io\/(.+)/;
class NodeWorker implements k8s_common.K8sObjectToDduItemWorker<K8sNodeInfo, NodeInfo, Params> {
	itemAttrWorker = NodeAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		source: K8sNodeInfo,
		actionData: NodeInfo
	): Promise<void>
	{
		actionData.podCIDR = source.spec.podCIDR;
		actionData.status = {
			addresses: source.status.addresses,
			capacity: source.status.capacity,
			nodeInfo: {
				kernelVersion: source.status.nodeInfo.kernelVersion,
				kubeletVersion: source.status.nodeInfo.kubeletVersion,
			},
		};

		/*
		 * Grabs the role of node by label
		 */
		actionData.role = "<N/A>";
		for (const labelName of Object.keys(actionData.labels)) {
			const matchedLabelValue = labelName.match(REGEXP_ROLE_LABEL);

			if (matchedLabelValue) {
				actionData.role = matchedLabelValue[1];
				break;
			}
		}
		// :~)

		/*
		 * Grabs the content of "ready" status
		 */
		actionData.ready = false;
		for (const cond of source.status.conditions) {
			if (cond.type === "Ready") {
				actionData.ready = cond.status.toLowerCase() === "true";
				actionData.readyMessage = cond.message;
				actionData.readyReason = cond.reason;
				break;
			}
		}
		// :~)

		return Promise.resolve();
	}
}

class NodeAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: NodeInfo;

	constructor(_args: GatherArguments<Params>, actionData: NodeInfo)
	{
		// this.args = args;
		this.actionData = actionData;
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		const status = this.actionData.status;
		const nodeInfo = status.nodeInfo;

		let notReadyText = "";
		if (!this.actionData.ready) {
			notReadyText = `󰾙 [${this.actionData.readyReason}}] `;
		}

		let cpuCapacity = "";
		if ("cpu" in status.capacity) {
			cpuCapacity = ` ${status.capacity["cpu"]}`;
		}

		let memoryCapacity = "";
		if ("memory" in status.capacity) {
			memoryCapacity = ` ${formatSize(status.capacity.memory)}`;
		}

		let storageCapacity = "";
		if ("ephemeral-storage" in status.capacity) {
			storageCapacity = ` ${formatSize(status.capacity["ephemeral-storage"])}`;
		}

		return Promise.resolve([
			`${theme.icons.prefix} `,
			this.actionData.name,
			`${notReadyText}  ${this.actionData.role}`,
			`󱦂 ${this.actionData.podCIDR} (${this.actionData.age})`,
			` ${nodeInfo.kubeletVersion}  ${nodeInfo.kernelVersion}`,
			`${cpuCapacity} ${memoryCapacity} ${storageCapacity}`,
			`(${theme.icons.resource_version} ${this.actionData.resourceVersion})`,
			`(${this.actionData.shortUid}...)`,
		]);
	}

	word(): Promise<string>
	{
		const nodeInfo = this.actionData.status.nodeInfo;

		// Don't know why: matcher_fzf needs a empty character to match first part of word
		return Promise.resolve(
			` ${this.actionData.name}/${this.actionData.role}/${nodeInfo.kernelVersion}/${nodeInfo.kubeletVersion}/${this.actionData.podCIDR}/${this.actionData.shortUid}/${this.actionData.age}`
		);
	}

	highlights(theme: k8s_common.K8sTheme): Promise<k8s_common.HighlightsOfComponent>
	{
		const statusHlGroup = this.actionData.ready ? theme.hl_groups.l1_info : theme.hl_groups.error;

		return Promise.resolve({
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon, },
			2: { name: "k8s-status", hl_group: statusHlGroup, },
			3: { name: "k8s-network-info", hl_group: theme.hl_groups.l2_info, },
			4: { name: "k8s-engine-info", hl_group: theme.hl_groups.l3_info, },
			5: { name: "k8s-capacity", hl_group: theme.hl_groups.l2_info, },
			6: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			7: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}

	info(commonInfo: ItemInfo[], theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		const itemList: ItemInfo[] = [];

		if (!this.actionData.ready) {
			itemList.push({
				text: `\t󰾙 ${this.actionData.readyMessage}`,
				hl_group: theme.hl_groups.error
			});
		}

		for (const [key, value] of Object.entries(this.actionData.status.capacity)) {
			itemList.push({
				text: `\t ${key}  ${value}`,
				hl_group: theme.hl_groups.l2_info
			});
		}

		itemList.push(...commonInfo);

		return Promise.resolve(itemList);
	}
}

function formatSize(quantityOfK8s: string)
{
	const numberOfBytes = bytes.parse(
		quantityOfK8s.replace(/([a-zA-Z])i/, '$1b')
	);

	return bytes.format(
		numberOfBytes,
		{ unitSeparator: ' ', thousandsSeparator: ',' }
	);
}
