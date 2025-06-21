import { BaseKind } from "jsr:@shougo/ddu-vim/kind";
import { CommonActions, buildPreviewer } from "../common.ts";

type Params = Record<string, undefined>;

export class Kind extends BaseKind<Params> {
	override actions = {
		...CommonActions<Params>("daemonset")
	};

	override getPreviewer = buildPreviewer();

	override params(): Params {
		return {};
	}
}
