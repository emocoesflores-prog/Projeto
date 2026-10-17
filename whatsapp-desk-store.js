const fs = require('node:fs/promises');
const path = require('node:path');
function createDeskStore(file = path.join(__dirname, '.whatsapp-desk.json')) {
  let queue = Promise.resolve();
  async function read() {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return { chats: {} }; throw e; }
  }
  return {
    async all() { await queue; return (await read()).chats; },
    async update(id, patch) {
      const job = queue.then(async () => {
        const data = await read();
        const previous = data.chats[id] || {};
        const changes = Object.keys(patch).filter(key => patch[key] !== previous[key]);
        const history = [...(previous.history || [])];
        if (changes.length) history.push({ at: new Date().toISOString(), fields: changes });
        data.chats[id] = { ...previous, ...patch, updatedAt: new Date().toISOString(), history: history.slice(-100) };
        const temp = file + '.tmp';
        await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600 });
        await fs.rename(temp, file);
        return data.chats[id];
      });
      queue = job.catch(() => {});
      return job;
    }
  };
}
module.exports = { createDeskStore };
