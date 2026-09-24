import {
  TIME_PATTERN,
  ValidationErrors,
  readBoolean,
  readNumber,
  readString,
} from './shared.js';

export interface ResourceTypeBody {
  readonly name: string;
  readonly sortOrder: number;
}

export function validateResourceTypeBody(body: unknown): ResourceTypeBody {
  const errors = new ValidationErrors();

  const name = readString(body, 'name').trim();
  if (name.length < 1 || name.length > 60) {
    errors.add('name', 'must be between 1 and 60 characters');
  }

  const sortOrder = readNumber(body, 'sortOrder') ?? 0;
  if (!Number.isInteger(sortOrder)) {
    errors.add('sortOrder', 'must be a whole number');
  }

  errors.throwIfAny();
  return { name, sortOrder };
}

export interface CreateResourceBody {
  readonly name: string;
  readonly typeId: string;
  readonly description: string;
  readonly capacity: number;
  readonly openTime: string;
  readonly closeTime: string;
}

function validateSharedResourceFields(
  body: unknown,
  errors: ValidationErrors,
): {
  name: string;
  description: string;
  capacity: number;
  openTime: string;
  closeTime: string;
} {
  const name = readString(body, 'name').trim();
  if (name.length < 1 || name.length > 120) {
    errors.add('name', 'must be between 1 and 120 characters');
  }

  // Not spec-mandated at an exact number (data-model.md leaves it as
  // unbounded TEXT) -- a generous cap purely so a pasted essay can't sit in
  // the database forever, per CLAUDE.md's "validate all input" baseline.
  const description = readString(body, 'description').trim();
  if (description.length > 2000) {
    errors.add('description', 'must be at most 2000 characters');
  }

  const capacity = readNumber(body, 'capacity') ?? NaN;
  if (!Number.isInteger(capacity) || capacity < 1) {
    errors.add('capacity', 'must be a whole number of at least 1');
  }

  const openTime = readString(body, 'openTime');
  if (!TIME_PATTERN.test(openTime)) {
    errors.add('openTime', 'must be a 24-hour time in HH:MM form');
  }

  const closeTime = readString(body, 'closeTime');
  if (!TIME_PATTERN.test(closeTime)) {
    errors.add('closeTime', 'must be a 24-hour time in HH:MM form');
  }

  if (
    TIME_PATTERN.test(openTime) &&
    TIME_PATTERN.test(closeTime) &&
    closeTime <= openTime
  ) {
    // String comparison works because both are zero-padded HH:MM.
    errors.add(
      'closeTime',
      'must be after openTime (overnight windows are not supported)',
    );
  }

  return { name, description, capacity, openTime, closeTime };
}

export function validateCreateResourceBody(body: unknown): CreateResourceBody {
  const errors = new ValidationErrors();

  const typeId = readString(body, 'typeId').trim();
  if (!typeId) errors.add('typeId', 'is required');

  const shared = validateSharedResourceFields(body, errors);

  errors.throwIfAny();
  return { typeId, ...shared };
}

export interface UpdateResourceBody {
  readonly name: string;
  readonly typeId: string;
  readonly description: string;
  readonly capacity: number;
  readonly openTime: string;
  readonly closeTime: string;
  readonly acknowledgeStrandedBookings: boolean;
}

// type_id is editable (functional.md > Edit a resource: "Changing name,
// description, capacity or type_id never triggers the [hours] warning" --
// implying it CAN change, just never triggers that specific check).
export function validateUpdateResourceBody(body: unknown): UpdateResourceBody {
  const errors = new ValidationErrors();

  const typeId = readString(body, 'typeId').trim();
  if (!typeId) errors.add('typeId', 'is required');

  const shared = validateSharedResourceFields(body, errors);

  errors.throwIfAny();
  return {
    typeId,
    ...shared,
    acknowledgeStrandedBookings: readBoolean(body, 'acknowledgeStrandedBookings'),
  };
}
