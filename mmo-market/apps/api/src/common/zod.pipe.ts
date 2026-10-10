import { PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

export class ZodPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    return this.schema.parse(value);
  }
}

/** Viết tắt: @Body(Z(schema)) */
export const Z = <T extends ZodTypeAny>(schema: T) => new ZodPipe(schema);
