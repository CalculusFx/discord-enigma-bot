import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = join(__dirname, '../../data/role-approvals.json');

function load() {
    try {
        if (existsSync(FILE)) return JSON.parse(readFileSync(FILE, 'utf8'));
    } catch {}
    return {};
}

function save(data) {
    writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// requestId -> { roleName, roleColor, roleHoist, roleMentionable, rolePermissions, requesterId, requesterTag, guildId }
export const pending = new Map(Object.entries(load()));

export function addRequest(requestId, data) {
    pending.set(requestId, data);
    save(Object.fromEntries(pending));
}

export function removeRequest(requestId) {
    pending.delete(requestId);
    save(Object.fromEntries(pending));
}
