"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PortainerService = void 0;
const core = __importStar(require("@actions/core"));
const axios_1 = __importStar(require("axios"));
class PortainerService {
    constructor(url, endpointId) {
        this.endpointId = endpointId;
        this.client = axios_1.default.create({ baseURL: url + '/api' });
    }
    authenticate(username, password) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            core.info('Authenticating with Portainer...');
            try {
                const { data } = yield this.client.post('/auth', {
                    username,
                    password,
                });
                this.client.defaults.headers.common['Authorization'] = `Bearer ${data.jwt}`;
                core.info('Authentication succeeded');
            }
            catch (e) {
                core.info(`Authentication failed: ${JSON.stringify(e instanceof axios_1.AxiosError ? (_a = e.response) === null || _a === void 0 ? void 0 : _a.data : e)}`);
                throw e;
            }
        });
    }
    getStacks() {
        return __awaiter(this, void 0, void 0, function* () {
            const { data } = yield this.client.get('/stacks', {
                params: { endpointId: this.endpointId },
            });
            return data;
        });
    }
    findStack(name) {
        return __awaiter(this, void 0, void 0, function* () {
            const stacks = yield this.getStacks();
            return stacks.find((s) => s.Name === name);
        });
    }
    createStack(name, stackFileContent, envVars) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            core.info(`Creating stack ${name}...`);
            try {
                const { data } = yield this.client.post('/stacks/create/standalone/string', {
                    name,
                    stackFileContent,
                    env: Object.entries(envVars).map(([name, value]) => ({
                        name,
                        value,
                    })),
                }, {
                    params: {
                        endpointId: this.endpointId,
                    },
                });
                core.info(`Successfully created stack ${data.Name} with id ${data.Id}`);
            }
            catch (e) {
                core.info(`Stack creation failed: ${JSON.stringify(e instanceof axios_1.AxiosError ? (_a = e.response) === null || _a === void 0 ? void 0 : _a.data : e)}`);
                throw e;
            }
            try {
                yield this.client.post(`/endpoints/${this.endpointId}/docker/networks/${name}_network/connect`, {
                    container: 'traefik',
                });
                core.info(`Traefik container connected to ${name}_network`);
            }
            catch (e) {
                core.info(`Failed to connect traefik container to ${name}_network: ${JSON.stringify(e instanceof axios_1.AxiosError ? (_b = e.response) === null || _b === void 0 ? void 0 : _b.data : e)}`);
            }
        });
    }
    updateStack(stack, stackFileContent, envVars) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            core.info(`Updating stack ${stack.Name}...`);
            try {
                const env = stack.Env;
                for (const [name, value] of Object.entries(envVars)) {
                    const entry = env.find((e) => e.name === name);
                    if (entry) {
                        entry.value = value;
                    }
                    else {
                        env.push({ name, value });
                    }
                }
                const { data } = yield this.client.put(`/stacks/${stack.Id}`, {
                    env,
                    stackFileContent,
                    pullImage: true,
                }, {
                    params: {
                        id: stack.Id,
                        endpointId: this.endpointId,
                    },
                });
                core.info(`Successfully updated stack ${data.Name}`);
            }
            catch (e) {
                core.info(`Stack update failed: ${JSON.stringify(e instanceof axios_1.AxiosError ? (_a = e.response) === null || _a === void 0 ? void 0 : _a.data : e)}`);
                throw e;
            }
        });
    }
    deleteStack(name) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            const stack = yield this.findStack(name);
            if (stack) {
                try {
                    yield this.client.post(`/endpoints/${this.endpointId}/docker/networks/${name}_network/disconnect`, {
                        container: 'traefik',
                        force: true,
                    });
                    core.info(`Traefik container disconnected from ${name}_network`);
                }
                catch (e) {
                    core.info(`Failed to disconnect traefik container from ${name}_network: ${JSON.stringify(e instanceof axios_1.AxiosError ? (_a = e.response) === null || _a === void 0 ? void 0 : _a.data : e)}`);
                }
                core.info(`Deleting stack ${name}...`);
                try {
                    yield this.client.delete(`/stacks/${stack.Id}`, {
                        params: { endpointId: this.endpointId },
                    });
                    core.info(`Successfully deleted stack ${name}`);
                    const imagePruneRes = yield this.client.post(`/endpoints/${this.endpointId}/docker/images/prune?filters={"dangling":["false"]}`);
                    core.info(`Removed ${(_c = (_b = imagePruneRes === null || imagePruneRes === void 0 ? void 0 : imagePruneRes.data.ImagesDeleted) === null || _b === void 0 ? void 0 : _b.filter((x) => x.Deleted).length) !== null && _c !== void 0 ? _c : 0} unused images`);
                    const volumePruneRes = yield this.client.post(`/endpoints/${this.endpointId}/docker/volumes/prune`);
                    core.info(`Removed ${(_e = (_d = volumePruneRes === null || volumePruneRes === void 0 ? void 0 : volumePruneRes.data.VolumesDeleted) === null || _d === void 0 ? void 0 : _d.length) !== null && _e !== void 0 ? _e : 0} unused volumes`);
                }
                catch (e) {
                    core.info(`Stack deletion failed: ${JSON.stringify(e instanceof axios_1.AxiosError ? (_f = e.response) === null || _f === void 0 ? void 0 : _f.data : e)}`);
                    throw e;
                }
            }
        });
    }
}
exports.PortainerService = PortainerService;
//# sourceMappingURL=PortainerService.js.map