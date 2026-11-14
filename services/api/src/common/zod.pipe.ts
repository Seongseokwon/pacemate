import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from './app-error.js';

/** 요청 본문·쿼리를 `packages/shared`의 스키마로 검증한다. 사용: `@Body(new ZodPipe(schema))` */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      fields[issue.path.join('.') || '_'] ??= issue.message;
    }
    throw new AppError('VALIDATION_ERROR', '입력한 내용을 확인해 주세요.', { fields });
  }
}
