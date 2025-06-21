import * as k8s_namespace from "../k8s_namespace.ts";
import * as mock from "jsr:@std/testing/mock";
import { GatherArguments } from "jsr:@shougo/ddu-vim/source";
import { describe, it, afterEach } from "jsr:@std/testing/bdd";
import { assertEquals } from "jsr:@std/assert";
import { DenopsStub } from "jsr:@denops/test";

describe("_loadNamespaces", () => {
	afterEach(() => {
		mock.restore();
	});

	const sampleNamespace = {
		items: [
			{
				kind: "namespace",
				metadata: {
					kind: "namespace",
					uid: "12345678-1234-5678-1234-56789abcdef",
					name: "default",
					creationTimestamp: "2023-04-15T15:42:17Z",
					resourceVersion: "8823",
				},
				status: {
					phase: "Active",
				},
			},
		]
	};

	it("normal data of K8S namespace", async () => {
		const fakeStdout = ReadableStream.from([ JSON.stringify(sampleNamespace) ])
			.pipeThrough(new TextEncoderStream());

		const processStub = {
			status: Promise.resolve({ success: true, code: 0 }),
			stdout: fakeStdout,
			stderr: {
				cancel: () => {},
			} as ReadableStream<Uint8Array<ArrayBuffer>>
		} as Deno.ChildProcess;
		const commandStub = {
			spawn: () => processStub,
		} as Deno.Command

		mock.stub(
			Deno, "Command",
			() => commandStub
		);

		const testedNamespaceInfo = await k8s_namespace._loadNamespaces(
			{
				denops: new DenopsStub(),
				sourceParams: { show_detail: false },
			} as unknown as GatherArguments<k8s_namespace.Params>
		);

		const expected = {
			...sampleNamespace.items[0].metadata,
			labels: undefined,
			annotations: undefined,
			context: undefined,
			namespace: undefined,
			ownerReferences: [],
			resourceVersion: "8823",
		} as unknown as k8s_namespace.NamespaceInfo;

		assertEquals(testedNamespaceInfo[0].action, expected);
	})
});
