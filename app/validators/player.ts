import vine from '@vinejs/vine'

const place = () => vine.string().trim().maxLength(100)

/**
 * A league admin's manual correction to a player's location — the only
 * override available when a platform reports it wrong, or not at all.
 */
export const updatePlayerLocationValidator = vine.create({
  city: place().optional(),
  state: place().optional(),
  country: place().optional(),
})
