export type FilterOperator = 
  | "equals" 
  | "not_equals" 
  | "contains" 
  | "greater_than" 
  | "less_than" 
  | "in" 
  | "not_in" 
  | "between"
  | "exists";

export interface FilterCondition {
  field: string;
  operator: FilterOperator;
  value?: any;
  value2?: any; // For between
}

export interface FilterGroup {
  logic: "AND" | "OR";
  conditions: (FilterCondition | FilterGroup)[];
}

/**
 * Transforms a FilterGroup into a MongoDB query object.
 */
export function buildMongoQuery(filterGroup: FilterGroup): Record<string, any> {
  if (!filterGroup || !filterGroup.conditions || filterGroup.conditions.length === 0) {
    return {};
  }

  const queries = filterGroup.conditions.map(condition => {
    // If it's a nested group
    if ('logic' in condition) {
      return buildMongoQuery(condition as FilterGroup);
    }

    // It's a condition
    const cond = condition as FilterCondition;
    const query: Record<string, any> = {};

    switch (cond.operator) {
      case "equals":
        query[cond.field] = cond.value;
        break;
      case "not_equals":
        query[cond.field] = { $ne: cond.value };
        break;
      case "contains":
        query[cond.field] = { $regex: String(cond.value), $options: "i" };
        break;
      case "greater_than":
        query[cond.field] = { $gt: cond.value };
        break;
      case "less_than":
        query[cond.field] = { $lt: cond.value };
        break;
      case "in":
        query[cond.field] = { $in: Array.isArray(cond.value) ? cond.value : [cond.value] };
        break;
      case "not_in":
        query[cond.field] = { $nin: Array.isArray(cond.value) ? cond.value : [cond.value] };
        break;
      case "between":
        query[cond.field] = { $gte: cond.value, $lte: cond.value2 };
        break;
      case "exists":
        query[cond.field] = { $exists: Boolean(cond.value) };
        break;
    }
    return query;
  });

  if (filterGroup.logic === "OR") {
    return { $or: queries };
  } else {
    // For AND, we merge them or use $and if fields overlap
    return { $and: queries };
  }
}
