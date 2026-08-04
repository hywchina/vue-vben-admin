import { defineEventHandler } from 'h3';
import { getRequestId } from '~/utils/request';

export default defineEventHandler((event) => {
  getRequestId(event);
});
