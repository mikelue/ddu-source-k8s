import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";

export type Params = k8s_common.CommonParams;

type EndpointSlicePort = {
	port: number;
	protocol: string;
}

type K8sEndpointSliceInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	addressType: string;
	endpoints: {
		addresses: string[];
		targetRef: k8s_common.K8sTargetRef;
	}[];
	ports: EndpointSlicePort[];
}

// The EndpointSlice information used in DDU
export type EndpointSliceInfo = k8s_common.CommonMeta & {
	addressType: string;
	endpoints: {
		addresses: string[];
		targetRef: k8s_common.K8sTargetRef;
	}[];
	ports: EndpointSlicePort[];
};

export class Source extends BaseSource<Params> {
	override kind = "k8s_endpointslice";

	override gather = new k8s_common.ItemFactory("endpointslice")
		.buildGather(new EndpointSliceWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

class EndpointSliceWorker implements k8s_common.K8sObjectToDduItemWorker<K8sEndpointSliceInfo, EndpointSliceInfo, Params> {
	itemAttrWorker = EndpointSliceAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		source: K8sEndpointSliceInfo,
		endpointSliceInfo: EndpointSliceInfo
	): Promise<void>
	{
		endpointSliceInfo.addressType = source.addressType;
		endpointSliceInfo.endpoints = source.endpoints.map(origEndpoint => {
			return {
				addresses: origEndpoint.addresses,
				targetRef: {
					kind: origEndpoint.targetRef.kind,
					name: origEndpoint.targetRef.name,
					uid: origEndpoint.targetRef.uid,
				},
			}
		})
		endpointSliceInfo.ports = source.ports
			.map(origPort => {
				return {
					port: origPort.port,
					protocol: origPort.protocol,
				}
			});

		return Promise.resolve();
	}
}

class EndpointSliceAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: EndpointSliceInfo;
	private readonly portsAsText: string;
	private readonly addressesAsText: string;

	constructor(_args: GatherArguments<Params>, actionData: EndpointSliceInfo)
	{
		// this.args = args;
		this.actionData = actionData;
		this.portsAsText = actionData.ports.map(port => `${port.port}/${port.protocol}`).join(",");
		this.addressesAsText = actionData.endpoints.map(endpoint => endpoint.addresses.join(",")).join(",");
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		return Promise.resolve([
			`${theme.icons.prefix} `,
			this.actionData.name,
			`󰿘 ${this.actionData.addressType} (${this.portsAsText}) 󰩠 ${this.addressesAsText} (${this.actionData.age})`,
			`(${theme.icons.resource_version} ${this.actionData.resourceVersion})`,
			`(${this.actionData.shortUid}...)`,
		]);
	}

	word(): Promise<string>
	{
		// Don't know why: matcher_fzf needs a empty character to match first part of word
		return Promise.resolve(
			` ${this.actionData.name}/${this.portsAsText}/${this.addressesAsText}/${this.actionData.shortUid}/${this.actionData.age}`
		);
	}

	highlights(theme: k8s_common.K8sTheme): Promise<k8s_common.HighlightsOfComponent>
	{
		return Promise.resolve({
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon, },
			2: { name: "k8s-endpointSlice-network", hl_group: theme.hl_groups.l1_info, },
			3: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			4: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}

	info(commonInfo: ItemInfo[], theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		const infoList: ItemInfo[] = [];

		for (const endpoint of this.actionData.endpoints) {
			const targetRef = endpoint.targetRef;
			const addresses = endpoint.addresses.join(", ");

			infoList.push({
				text: `\t${theme.icons.prefix} ${addresses}  ${targetRef.name}(${targetRef.kind}) (${targetRef.uid.slice(0, 9)}...)`,
				hl_group: theme.hl_groups.l2_info,
			});
		}

		infoList.push(...commonInfo);

		return Promise.resolve(infoList);
	}
}
