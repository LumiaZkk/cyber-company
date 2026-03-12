import {
  buildBoardRequirementSurface,
  describeRequirementRoomPreview,
  type BoardRequirementSurface,
} from "./board-requirement-surface";
import { buildBoardTaskSurface, type BoardTaskSurface } from "./board-task-surface";

export type PrimaryRequirementProjection = BoardRequirementSurface;
export type RequirementExecutionProjection = BoardTaskSurface;

export function buildPrimaryRequirementProjection(
  input: Parameters<typeof buildBoardRequirementSurface>[0],
): PrimaryRequirementProjection {
  return buildBoardRequirementSurface(input);
}

export function buildRequirementExecutionProjection(
  input: Parameters<typeof buildBoardTaskSurface>[0],
): RequirementExecutionProjection {
  return buildBoardTaskSurface(input);
}

export { describeRequirementRoomPreview };
