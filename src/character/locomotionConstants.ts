/**
 * Shared locomotion-animation thresholds. Used by both the player's
 * `ThirdPersonCharacter` and the AI `Enemy` rig so walk/run/idle selection is
 * consistent between them.
 *
 * Sit between WALK_SPEED (1.5) and RUN_SPEED (5.5): anything above ~3 m/s counts
 * as a jog/run for animation purposes. Below MOVE_SPEED_THRESHOLD the character
 * returns to idle.
 */
export const RUN_SPEED_THRESHOLD = 3.0
export const MOVE_SPEED_THRESHOLD = 0.3
/** Rate the body yaw slerps toward the movement/aim direction. */
export const YAW_LERP_RATE = 8
