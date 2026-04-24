import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';

// Load .env if present
dotenv.config({ override: false });

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

if (!token || !clientId) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in environment. Set them in .env or export them.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

async function listGlobal() {
  const global = await rest.get(Routes.applicationCommands(clientId));
  return Array.isArray(global) ? global : [];
}

async function listGuild(guildId) {
  const cmds = await rest.get(Routes.applicationGuildCommands(clientId, guildId));
  return Array.isArray(cmds) ? cmds : [];
}

(async () => {
  try {
    console.log('Fetching global commands...');
    const global = await listGlobal();
    const globalNames = new Map(global.map(c => [c.id, c.name]));

    // Build initial map from command name -> info
    const cmdMap = new Map();
    for (const g of global) {
      cmdMap.set(g.name, { name: g.name, global: true, guilds: [] });
    }

    // Gather guild ids: from CLI args + GUILD_ID env (if set)
    const args = process.argv.slice(2) || [];
    const guildIds = new Set(args.concat(process.env.GUILD_ID ? [process.env.GUILD_ID] : []));

    for (const gid of guildIds) {
      if (!gid) continue;
      try {
        console.log(`Fetching commands for guild ${gid}...`);
        const gcmds = await listGuild(gid);
        for (const c of gcmds) {
          if (!cmdMap.has(c.name)) cmdMap.set(c.name, { name: c.name, global: false, guilds: [gid] });
          else cmdMap.get(c.name).guilds.push(gid);
        }
      } catch (err) {
        console.warn(`Failed to fetch guild ${gid}:`, err.message || err);
      }
    }

    // Print report
    console.log('\nCommand scope report:');
    const rows = Array.from(cmdMap.values()).sort((a,b) => a.name.localeCompare(b.name));
    for (const r of rows) {
      console.log(`- ${r.name}  -> global: ${r.global ? 'yes' : 'no'}${r.guilds.length ? `, guilds: ${r.guilds.join(',')}` : ''}`);
    }

    // Also list commands that exist only in guilds (not in global)
    console.log('\n(If a command is only in a guild, global: no and it will list the guilds.)');

    process.exit(0);
  } catch (err) {
    console.error('Error while fetching commands:', err);
    process.exit(2);
  }
})();
