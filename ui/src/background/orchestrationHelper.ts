/**
 * Orchestration Helper Functions
 * Helper functions for the orchestrator V2
 *
 * Responsibilities:
 * - Condition evaluation logic
 */

import type {
  SequentialJobState,
  StepOutput,
  ConditionalNextStep,
  ConditionalStepCondition,
} from './orchestration-types';

// ============================================================================
// CONDITION EVALUATION
// ============================================================================

/**
 * Evaluate a property path against state and data
 * Supports nested paths like 'data.type', 'state.currentJobIndex', etc.
 *
 * @param propPath - Property path (e.g., 'data.type', 'state.currentJobIndex')
 * @param state - Current job state
 * @param data - Step output data
 * @returns The value at the property path, or undefined if not found
 */
export function evaluatePropertyPath(
  propPath: string,
  state: SequentialJobState,
  data?: StepOutput
): any {
  const parts = propPath.split('.');
  let current: any;

  // Handle the first part specially - 'state' or 'data'
  if (parts[0] === 'state') {
    current = state;
    // Skip the first part and continue with the rest
    for (let i = 1; i < parts.length; i++) {
      if (current === null || current === undefined) {
        return undefined;
      }
      const key = parts[i];
      if (key === undefined) {
        return undefined;
      }
      current = current[key];
    }
  } else if (parts[0] === 'data') {
    // Access the StepOutput's data property
    current = data?.data;
    // Skip the first part and continue with the rest
    for (let i = 1; i < parts.length; i++) {
      if (current === null || current === undefined) {
        return undefined;
      }
      const key = parts[i];
      if (key === undefined) {
        return undefined;
      }
      current = current[key];
    }
  } else {
    // Fallback to old behavior for other paths
    current = { state, data };
    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
  }

  return current;
}

/**
 * Evaluate a single condition
 * Returns true if the condition matches, false otherwise
 *
 * @param condition - Condition to evaluate
 * @param state - Current job state
 * @param data - Step output data
 * @returns True if condition matches
 */
export function evaluateCondition(
  condition: ConditionalStepCondition,
  state: SequentialJobState,
  data?: StepOutput
): boolean {
  const propValue = evaluatePropertyPath(condition.prop, state, data);

  // TODO: Remove debug logs - Temporary debugging for test
  console.log(
    `[DEBUG] evaluateCondition - prop: ${condition.prop}, propValue:`,
    propValue,
    'expected val:',
    condition.val
  );
  console.log(`[DEBUG] evaluateCondition - data structure:`, JSON.stringify(data, null, 2));

  // If comparing to another property
  if (condition.compareTo !== undefined) {
    const compareValue = evaluatePropertyPath(condition.compareTo, state, data);
    const operator = condition.operator || '===';

    // TODO: Remove debug logs - Temporary debugging for test
    console.log(
      `[DEBUG] evaluateCondition - compareTo: ${condition.compareTo}, compareValue:`,
      compareValue,
      'operator:',
      operator
    );
    console.log(
      `[DEBUG] evaluateCondition - Comparison: ${propValue} ${operator} ${compareValue} = ${propValue < compareValue}`
    );

    switch (operator) {
      case '<': {
        const result = propValue < compareValue;
        console.log(
          `[DEBUG] evaluateCondition - Result: ${propValue} < ${compareValue} = ${result}`
        );
        return result;
      }
      case '<=':
        return propValue <= compareValue;
      case '>':
        return propValue > compareValue;
      case '>=':
        return propValue >= compareValue;
      default:
        // Fallback to equality if operator not recognized
        return propValue === compareValue;
    }
  }

  // Equality check using val
  if ('val' in condition) {
    const matches = propValue === condition.val;
    // TODO: Remove debug logs - Temporary debugging for test
    console.log(
      `[DEBUG] evaluateCondition - Comparison result: ${propValue} === ${condition.val} = ${matches}`
    );
    return matches;
  }

  // Invalid condition (neither val nor compareTo specified)
  return false;
}

/**
 * Evaluate conditional next step conditions
 * Returns the step name from the first matching condition, or defaultStep if provided and no conditions match, or null
 *
 * @param conditionalNextStep - Conditional next step configuration
 * @param state - Current job state
 * @param data - Step output data
 * @returns Step name if condition matches, defaultStep if provided and no match, null otherwise
 */
export function evaluateConditionalNextStep(
  conditionalNextStep: ConditionalNextStep,
  state: SequentialJobState,
  data?: StepOutput
): string | null {
  for (const condition of conditionalNextStep.conditions) {
    if (evaluateCondition(condition, state, data)) {
      console.log(
        `[Orchestrator V2] Condition matched: ${condition.prop} ${condition.compareTo ? `${condition.operator || '==='} ${condition.compareTo}` : `=== ${JSON.stringify(condition.val)}`}, next step: ${condition.step}`
      );
      return condition.step;
    }
  }

  // No conditions matched - use defaultStep if provided
  if (conditionalNextStep.defaultStep !== undefined) {
    console.log(
      `[Orchestrator V2] No conditions matched, using defaultStep: ${conditionalNextStep.defaultStep}`
    );
    return conditionalNextStep.defaultStep;
  }

  // No conditions matched and no defaultStep
  console.warn(
    `[Orchestrator V2] No conditions matched and no defaultStep provided, defaulting to null`
  );
  return null;
}
