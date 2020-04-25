import Rest from '@spectacles/rest';
import { User } from '@spectacles/types';
import { SQL } from 'postgres';
import { inject, injectable } from 'tsyringe';
import { URLSearchParams } from 'url';
import { kSQL } from '../tokens';

export enum CaseAction {
	ROLE,
	UN_ROLE,
	WARN,
	KICK,
	SOFTBAN,
	BAN,
	UN_BAN,
}

export interface RawCase {
	action_expiration: string | null;
	ref_id: number | null;
	action_processed: boolean;
	target_id: string;
	action: number;
	role_id: string | null;
	case_id: number;
	context_message_id: string | null;
	mod_id: string;
	target_tag: string;
	reason: string;
	log_message_id: string | null;
	created_at: string;
	mod_tag: string;
	guild_id: string;
}

export interface Case {
	caseId: number;
	guildId: string;
	targetId: string;
	moderatorId: string;
	action: CaseAction;
	roleId?: string;
	actionExpiration?: Date;
	reason: string;
	deleteMessageDays?: number;
	contextMessageId?: string;
	referenceId?: number;
}

@injectable()
export default class CaseManager {
	constructor(
		@inject(kSQL)
		public readonly sql: SQL,
		public readonly rest: Rest,
	) {}

	insert(item: Case): Promise<void> {
		throw new Error('Method not implemented.');
	}

	update(item: Partial<Case>): Promise<void> {
		throw new Error('Method not implemented.');
	}

	delete(item: Partial<Case>): Promise<void> {
		throw new Error('Method not implemented.');
	}

	public async create(case_: Case): Promise<Case> {
		const requestOptions = { reason: case_.reason };
		switch (case_.action) {
			case CaseAction.ROLE:
				await this.rest.put(`/guilds/${case_.guildId}/members/${case_.targetId}/roles/${case_.roleId}`, {}, requestOptions);
				break;
			case CaseAction.UN_ROLE:
				await this.rest.delete(`/guilds/${case_.guildId}/members/${case_.targetId}/roles/${case_.roleId}`, requestOptions);
				break;
			case CaseAction.WARN:
				break;
			case CaseAction.KICK:
				await this.rest.delete(`/guilds/${case_.guildId}/members/${case_.targetId}`, requestOptions);
				break;
			case CaseAction.SOFTBAN: {
				const params = new URLSearchParams({
					'delete-message-days': case_.deleteMessageDays?.toString() ?? '1',
					reason: case_.reason,
				});

				await this.rest.put(`/guilds/${case_.guildId}/bans/${case_.targetId}?${params}`, requestOptions);
				await this.rest.delete(`/guilds/${case_.guildId}/bans/${case_.targetId}`, { reason: `Softban: ${case_.reason}` });
				break;
			}
			case CaseAction.BAN: {
				const params = new URLSearchParams({
					'delete-message-days': case_.deleteMessageDays?.toString() ?? '1',
					reason: case_.reason,
				});

				await this.rest.put(`/guilds/${case_.guildId}/bans/${case_.targetId}?${params}`, requestOptions);
				break;
			}
			case CaseAction.UN_BAN:
				await this.rest.delete(`/guilds/${case_.guildId}/bans/${case_.targetId}`, requestOptions);
				break;
		}

		const [target, mod]: [User, User] = await Promise.all([
			this.rest.get(`/users/${case_.targetId}`),
			this.rest.get(`/users/${case_.moderatorId}`),
		]);

		const [newCase] = await this.sql`
			insert into cases (
				case_id,
				guild_id,
				mod_id,
				mod_tag,
				target_id,
				target_tag,
				action,
				role_id,
				action_expiration,
				reason,
				context_message_id,
				ref_id
			) values (
				next_case(${case_.guildId}),
				${case_.guildId},
				${case_.moderatorId},
				${`${mod.username}#${mod.discriminator}`},
				${case_.targetId},
				${`${target.username}#${target.discriminator}`},
				${case_.action},
				${case_.roleId ?? null},
				${case_.actionExpiration ?? null},
				${case_.reason},
				${case_.contextMessageId ?? null},
				${case_.referenceId ?? null}
			)
			returning case_id`;

		case_.caseId = (newCase as any).case_id;
		return case_;
	}
}