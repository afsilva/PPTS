import { catalogMutation } from "@/modules/catalog/http";
import { correctOwnTime } from "@/modules/time-tracking/corrections";
import { timeCorrectionSchema } from "@/modules/time-tracking/schemas";

export async function POST(request: Request) {
  return catalogMutation(request, timeCorrectionSchema, "TIME_CORRECTED", correctOwnTime, "/time");
}
