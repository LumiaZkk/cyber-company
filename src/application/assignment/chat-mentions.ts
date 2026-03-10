import type { Company, EmployeeRef } from "../../domain/org/types";

function createChatMentionRegex(): RegExp {
  return /@([^\s@]+)/g;
}

function resolveMentionedEmployees(text: string, employees: EmployeeRef[]): EmployeeRef[] {
  const mentions = text.matchAll(createChatMentionRegex());
  const found: EmployeeRef[] = [];
  const seen = new Set<string>();
  for (const match of mentions) {
    const token = (match[1] ?? "").trim();
    if (!token) {
      continue;
    }
    const normalizedToken = token.toLowerCase();
    if (seen.has(normalizedToken)) {
      continue;
    }
    seen.add(normalizedToken);
    const matched =
      employees.find((employee) => {
        const values = [employee.agentId, employee.nickname, employee.role]
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean);
        return values.some(
          (value) =>
            value === normalizedToken ||
            value.includes(normalizedToken) ||
            normalizedToken.includes(value),
        );
      }) ?? null;
    if (matched) {
      found.push(matched);
    }
  }
  return found;
}

export function resolveMentionedEmployeesInText(text: string, company: Company | null): EmployeeRef[] {
  if (!company) {
    return [];
  }

  return resolveMentionedEmployees(text, company.employees);
}

export function resolveMentionedEmployeesInEmployees(
  text: string,
  employees: EmployeeRef[] | null | undefined,
): EmployeeRef[] {
  if (!employees || employees.length === 0) {
    return [];
  }
  return resolveMentionedEmployees(text, employees);
}
