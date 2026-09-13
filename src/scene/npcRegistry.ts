import { NANUQ, SILA, type CharacterConfig } from '../content/characters'
import type { NpcBehavior } from './Npc'

/**
 * Which villagers exist, and how each one behaves. Keyed by the
 * placement `type`, so putting a villager in the world is one row in
 * `placements.json` and no scene code at all — the same deal props get
 * from PROP_REGISTRY.
 *
 * Koa is deliberately NOT here: he is seated, holds an instrument and
 * schedules his own audio, which is a component, not a behaviour.
 */
export const NPC_REGISTRY: Record<string, { config: CharacterConfig; behavior: NpcBehavior }> = {
  'npc-nanuq': { config: NANUQ, behavior: { kind: 'wander', radiusM: 4 } },
  'npc-sila': { config: SILA, behavior: { kind: 'idle' } },
}

export const isNpcType = (type: string) => type in NPC_REGISTRY
