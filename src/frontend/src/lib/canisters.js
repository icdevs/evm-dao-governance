import { createActor, canisterId } from 'declarations/backend';
import { building, browser } from '$app/environment';
import { CanisterStatus, Actor, HttpAgent } from '@dfinity/agent';

function dummyActor() {
    return new Proxy({}, {
        get() {
            if (building) {
                throw new Error("Canister invoked while building");
            } else {
                throw new Error("Canister not available in this environment");
            }
        }
    });
}

const buildingOrTesting = building || process.env.NODE_ENV === "test";
const hasValidCanisterId = canisterId && canisterId !== "undefined";

export const backend = buildingOrTesting || !hasValidCanisterId || !browser
    ? dummyActor()
    : createActor(canisterId);



// TODO avoid this hack?
async function didToJs(candidText) {
    // call didjs canister
    const didjs_id = "a4gq6-oaaaa-aaaab-qaa4q-cai"; // Any CandidUI canister
    const didjs_interface = ({ IDL }) => IDL.Service({
        did_to_js: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ['query']),
    });
    const agent = await HttpAgent.create({
        host: 'https://ic0.app'
    })
    const didjs = Actor.createActor(didjs_interface, { agent, canisterId: didjs_id });
    const js = await didjs.did_to_js(candidText);
    if (JSON.stringify(js) === JSON.stringify([])) {
        return undefined;
    }
    return js[0];
}
export async function fetchDidFromCanister(agent, canisterId) {
    // Try to get candid interface from metadata first
    let didText = await getDidFromMetadata(agent, canisterId);
    if (!didText) {
        // Fallback to tmp hack method
        didText = await getActorFromTmpHack(agent, canisterId);
        if (!didText) {
            throw new Error("Failed to retrieve Candid interface for canister: " + canisterId);
        }
    }
    return didText;
}

export async function fetchActorFromCanister(agent, canisterId) {
    const didText = await fetchDidFromCanister(agent, canisterId);
    const didJs = await didToJs(didText);
    const dataUri =
        "data:text/javascript;charset=utf-8," +
        encodeURIComponent(didJs);

    const candid = await eval('import("' + dataUri + '")');
    return Actor.createActor(candid.idlFactory, {
        agent,
        canisterId,
    });
}

async function getDidFromMetadata(agent, canisterId) {

    // Attempt to use canister metadata
    const status = await CanisterStatus.request({
        agent,
        canisterId: canisterId,
        paths: ['candid'],
    });
    return status.get('candid');

}

async function getActorFromTmpHack(agent, canisterId) {
    // Use `__get_candid_interface_tmp_hack` for canisters without Candid metadata
    const tmpHackInterface = ({ IDL }) =>
        IDL.Service({
            __get_candid_interface_tmp_hack: IDL.Func([], [IDL.Text], ['query']),
        });
    const actor = Actor.createActor(tmpHackInterface, { agent, canisterId });
    return await actor.__get_candid_interface_tmp_hack();
}

