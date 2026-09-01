import vine from '@vinejs/vine'

const place = () => vine.string().trim().maxLength(100)

/**
 * A league admin's manual corrections to a player.
 */
export const updatePlayerValidator = vine.create({
  displayTag: vine.string().trim().minLength(1).maxLength(100),
  city: place().optional(),
  state: place().optional(),
  country: place().optional(),
})
