export async function settlePairing(pairedThisRun, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  // A settling period is a mitigation; a subsequent authenticated launch proves persistence.
  if (pairedThisRun) await sleep(60000);
}

export function selectGroup(chats, name) {
  const matches = chats.filter(chat => chat.isGroup && chat.name === name);
  if (matches.length !== 1) throw new Error(`Expected one group named ${name}; found ${matches.length}. Use --list and configure its unique ID.`);
  return matches[0].id._serialized;
}
