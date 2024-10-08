import * as core from '@actions/core';
import axios, { AxiosError, AxiosInstance } from 'axios';

type Stack = {
	Id: number;
	Name: string;
	Env: {
		name: string;
		value: string | number | boolean;
	}[];
};
export class PortainerService {
	private client: AxiosInstance;

	constructor(url: string, private endpointId: number) {
		this.client = axios.create({ baseURL: url + '/api' });
	}

	async authenticate(username: string, password: string) {
		core.info('Authenticating with Portainer...');
		try {
			const { data } = await this.client.post('/auth', {
				username,
				password,
			});
			this.client.defaults.headers.common[
				'Authorization'
			] = `Bearer ${data.jwt}`;
			core.info('Authentication succeeded');
		} catch (e) {
			core.info(
				`Authentication failed: ${JSON.stringify(
					e instanceof AxiosError ? e.response?.data : e
				)}`
			);
			throw e;
		}
	}

	async getStacks(): Promise<Stack[]> {
		const { data } = await this.client.get('/stacks', {
			params: { endpointId: this.endpointId },
		});
		return data;
	}

	async findStack(name: string) {
		const stacks = await this.getStacks();
		return stacks.find((s) => s.Name === name);
	}

	async createStack(
		name: string,
		stackFileContent: string,
		envVars: Record<string, string>
	) {
		core.info(`Creating stack ${name}...`);
		try {
			const { data } = await this.client.post(
				'/stacks/create/standalone/string',
				{
					name,
					stackFileContent,
					env: Object.entries(envVars).map(([name, value]) => ({
						name,
						value,
					})),
				},
				{
					params: {
						endpointId: this.endpointId,
					},
				}
			);
			core.info(
				`Successfully created stack ${data.Name} with id ${data.Id}`
			);
		} catch (e) {
			core.info(
				`Stack creation failed: ${JSON.stringify(
					e instanceof AxiosError ? e.response?.data : e
				)}`
			);
			throw e;
		}
		try {
			await this.client.post(
				`/endpoints/${this.endpointId}/docker/networks/${name}_network/connect`,
				{
					container: 'traefik',
				}
			);
			core.info(`Traefik container connected to ${name}_network`);
		} catch (e) {
			core.info(
				`Failed to connect traefik container to ${name}_network: ${JSON.stringify(
					e instanceof AxiosError ? e.response?.data : e
				)}`
			);
		}
	}

	async updateStack(
		stack: Stack,
		stackFileContent: string,
		envVars: Record<string, string>
	) {
		core.info(`Updating stack ${stack.Name}...`);
		try {
			const env = stack.Env;
			for (const [name, value] of Object.entries(envVars)) {
				const entry = env.find((e) => e.name === name);
				if (entry) {
					entry.value = value;
				} else {
					env.push({ name, value });
				}
			}
			const { data } = await this.client.put(
				`/stacks/${stack.Id}`,
				{
					env,
					stackFileContent,
					pullImage: true,
				},
				{
					params: {
						id: stack.Id,
						endpointId: this.endpointId,
					},
				}
			);
			core.info(`Successfully updated stack ${data.Name}`);
		} catch (e) {
			core.info(
				`Stack update failed: ${JSON.stringify(
					e instanceof AxiosError ? e.response?.data : e
				)}`
			);
			throw e;
		}
	}

	async deleteStack(name: string) {
		const stack = await this.findStack(name);
		if (stack) {
			try {
				await this.client.post(
					`/endpoints/${this.endpointId}/docker/networks/${name}_network/disconnect`,
					{
						container: 'traefik',
						force: true,
					}
				);
				core.info(
					`Traefik container disconnected from ${name}_network`
				);
			} catch (e) {
				core.info(
					`Failed to disconnect traefik container from ${name}_network: ${JSON.stringify(
						e instanceof AxiosError ? e.response?.data : e
					)}`
				);
			}
			core.info(`Deleting stack ${name}...`);
			try {
				await this.client.delete(`/stacks/${stack.Id}`, {
					params: { endpointId: this.endpointId },
				});
				core.info(`Successfully deleted stack ${name}`);

				const imagePruneRes = await this.client.post(
					`/endpoints/${this.endpointId}/docker/images/prune?filters={"dangling":["false"]}`
				);
				core.info(
					`Removed ${
						imagePruneRes?.data.ImagesDeleted?.filter(
							(x: any) => x.Deleted
						).length ?? 0
					} unused images`
				);

				const volumePruneRes = await this.client.post(
					`/endpoints/${this.endpointId}/docker/volumes/prune`
				);
				core.info(
					`Removed ${
						volumePruneRes?.data.VolumesDeleted?.length ?? 0
					} unused volumes`
				);
			} catch (e) {
				core.info(
					`Stack deletion failed: ${JSON.stringify(
						e instanceof AxiosError ? e.response?.data : e
					)}`
				);
				throw e;
			}
		}
	}
}
