import type { ItemInfo } from "jsr:@shougo/ddu-vim/types";
import { BaseSource, GatherArguments } from "jsr:@shougo/ddu-vim/source";
import * as k8s_common from "../common.ts";

export type Params = k8s_common.CommonParams;

type ServicePort = {
	protocol: string;
	port?: number;
	nodePort?: number;
	name?: string;
}

type K8sServiceInfo = {
	kind: string;
	metadata: k8s_common.CommonMeta;
	spec: {
		type: string
		clusterIP: string;
		selector?: Record<string, string>;
		ports: ServicePort[]
	};
}

// The Service information used in DDU
export type ServiceInfo = k8s_common.CommonMeta & {
	type: string
	clusterIP: string;
	selector?: Record<string, string>;
	ports: ServicePort[]
};

export class Source extends BaseSource<Params> {
	override kind = "k8s_service";

	override gather = new k8s_common.ItemFactory("service")
		.buildGather(new ServiceWorker());

	override params(): Params {
		return {
			...k8s_common.DefaultCommonParams,
		};
	}
}

class ServiceWorker implements k8s_common.K8sObjectToDduItemWorker<K8sServiceInfo, ServiceInfo, Params> {
	itemAttrWorker = ServiceAttrWorker;

	toActionData(
		_args: GatherArguments<Params>,
		source: K8sServiceInfo,
		actionData: ServiceInfo
	): Promise<void>
	{
		actionData.type = source.spec.type;
		actionData.clusterIP = source.spec.clusterIP;
		actionData.selector = source.spec.selector;
		actionData.ports = source.spec.ports.map(
			origPort => {
				return {
					port: origPort.port,
					protocol: origPort.protocol,
					name: origPort.name,
				};
			}
		);

		return Promise.resolve();
	}
}

class ServiceAttrWorker implements k8s_common.DduItemAttrWorker {
	// private readonly args: GatherArguments<k8s_common.CommonParams>;
	private readonly actionData: ServiceInfo;
	private readonly portsAsText: string;
	private readonly nodePortsAsText: string;

	constructor(_args: GatherArguments<Params>, actionData: ServiceInfo)
	{
		// this.args = args;
		this.actionData = actionData;
		this.portsAsText = actionData.ports
			.filter(port => port.port)
			.map(port => `${port.port}/${port.protocol}`).join(",");

		this.nodePortsAsText = actionData.ports
			.filter(port => port.nodePort)
			.map(port => `${port.nodePort}/${port.protocol}`).join(",");
	}

	displayComponents(theme: k8s_common.K8sTheme): Promise<string[]>
	{
		return Promise.resolve([
			`${theme.icons.prefix} `,
			this.actionData.name,
			` ${this.actionData.type}`,
			`󰒍 ${this.actionData.clusterIP} (${this.portsAsText}${this.nodePortsAsText}) (${this.actionData.age})`,
			`(${theme.icons.resource_version} ${this.actionData.resourceVersion})`,
			`(${this.actionData.shortUid}...)`,
		]);
	}

	word(): Promise<string>
	{
		// Don't know why: matcher_fzf needs a empty character to match first part of word
		return Promise.resolve(
			` ${this.actionData.name}/${this.actionData.type}/${this.actionData.clusterIP}/${this.nodePortsAsText}/${this.portsAsText}/${this.actionData.shortUid}/${this.actionData.age}`
		);
	}

	highlights(theme: k8s_common.K8sTheme): Promise<k8s_common.HighlightsOfComponent>
	{
		return Promise.resolve({
			0: { name: "k8s-icon", hl_group: theme.hl_groups.prefix_icon, },
			2: { name: "k8s-service-type", hl_group: theme.hl_groups.l1_info },
			3: { name: "k8s-service-network", hl_group: theme.hl_groups.l2_info, },
			4: { name: "k8s-resource-version", hl_group: theme.hl_groups.resource_version, },
			5: { name: "k8s-uid", hl_group: theme.hl_groups.uid, },
		})
	}

	info(commonInfo: ItemInfo[], theme: k8s_common.K8sTheme): Promise<ItemInfo[]>
	{
		const infoList: ItemInfo[] = k8s_common.buildInfoOfSelector(
			{
				matchLabels: this.actionData.selector
			},
			theme
		);

		infoList.push(...commonInfo);

		return Promise.resolve(infoList);
	}
}
