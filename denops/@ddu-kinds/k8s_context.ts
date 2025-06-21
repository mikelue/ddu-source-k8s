import { ActionFlags, ActionArguments, Actions, DduItem } from "jsr:@shougo/ddu-vim/types";
import { ContextInfo } from "../@ddu-sources/k8s_context.ts";
import { BaseKind } from "jsr:@shougo/ddu-vim/kind";
import { TypeOfPutText, putTextBy, yankBy } from "../common.ts";

type Params = Record<string, undefined>;

const actions: Actions<Params> = {
	'use': {
		description: "Use the context",
		callback: async(
			args : ActionArguments<Params>
		) : Promise<ActionFlags> => {
			const contextInfo = args.items[0].action as ContextInfo;

			// Use context
			const proc = new Deno.Command("kubectl",
				{
					args: ["config", "use-context", contextInfo.name],
					stdout: 'piped',
					stderr: 'piped',
				}
			).spawn();

			const output = await proc.output();

			if (!output.success) {
				const errorMessage = `Failed to use context[${output.code}]: ${output.stderr}`;
				console.error(errorMessage);
				return Promise.reject(new Error(errorMessage));
			}

			console.log(`Has used context: ${contextInfo.name}`);

			return ActionFlags.RefreshItems;
		}
	},
	'insert': {
		description: "Insert name of context(kubectl) to buffer of context",
		callback: (
			args : ActionArguments<Params>
		) : Promise<ActionFlags> => {
			putTextBy(args, TypeOfPutText.INSERT,
				item => (item.action as ContextInfo).name
		 	);

			return Promise.resolve(ActionFlags.None);
		}
    },
	'append': {
		description: "Append name of context(kubectl) to buffer of context",
		callback: (
			args : ActionArguments<Params>
		) : Promise<ActionFlags> => {
			putTextBy(args, TypeOfPutText.APPEND,
				item => (item.action as ContextInfo).name
		 	);

			return Promise.resolve(ActionFlags.None);
		}
    },
	'yank': {
		description: "Yank selected context(kubectl)",
		callback: async (
			args : ActionArguments<Params>
		) : Promise<ActionFlags> => {
			const grabName = (item: DduItem) => (item.action as ContextInfo).name;

			await yankBy(args, grabName)
				.then(_ => {
					console.log(`Have yanked [${args.items.length}] contexts`);
				});

			return ActionFlags.None
		}
    },
}

export class Kind extends BaseKind<Params> {
	override actions = actions;

	override params(): Params {
		return {};
	}
}
