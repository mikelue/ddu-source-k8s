import * as k8s_context from "../k8s_context.ts";
import * as mock from "jsr:@std/testing/mock";
import { GatherArguments } from "jsr:@shougo/ddu-vim/source";
import { describe, it, afterEach } from "jsr:@std/testing/bdd";
import { assertEquals } from "jsr:@std/assert";
import { DenopsStub } from "jsr:@denops/test";

type TestCaseOfK8sContext = {
	description: string;
	sample: string;
	expected: k8s_context.ContextInfo;
}

const testCases: TestCaseOfK8sContext[] = [
	{
		description: "Current context with and without namespace",
		sample: "* ct1 cluster-1 auth-1",
		expected: {
			is_current: true,
			name: "ct1",
			cluster: "cluster-1",
			authinfo: "auth-1",
			namespace: "",
		},
	},
	{
		description: "Context with namespace",
		sample: "* ct2 cluster-2 auth-2 namespace-2",
		expected: {
			is_current: true,
			name: "ct2",
			cluster: "cluster-2",
			authinfo: "auth-2",
			namespace: "namespace-2",
		}
	},
	{
		description: "Other context without namespace",
		sample: "  ct3 cluster-3 auth-3 namespace-3",
		expected: {
			is_current: false,
			name: "ct3",
			cluster: "cluster-3",
			authinfo: "auth-3",
			namespace: "namespace-3",
		},
	},
	{
		description: "Other context with namespace",
		sample: "  ct4 cluster-4 auth-4",
		expected: {
			is_current: false,
			name: "ct4",
			cluster: "cluster-4",
			authinfo: "auth-4",
			namespace: "",
		},
	}
];

describe("k8s_context", () => {
	afterEach(() => {
		mock.restore();
	});

	testCases.forEach((testCase) => {
		it(testCase.description, async () => {
			const fakeStdout = ReadableStream.from([ testCase.sample ])
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

			const commits = await k8s_context._loadContexts(
				{
					denops: new DenopsStub(),
					sourceParams: {},
				} as unknown as GatherArguments<k8s_context.Params>
			);

			assertEquals(commits[0].action, testCase.expected);
		});
	});
});
