import { cn as combineClassNames } from "cn";

function cn(...values: Parameters<typeof combineClassNames>): string {
  return combineClassNames(...values);
}

export { cn };
