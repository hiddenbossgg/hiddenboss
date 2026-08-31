import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import type { StatusPageRange, StatusPageRenderer } from '@adonisjs/core/types/http'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * On in every environment, so a mistyped URL or an unexpected error renders a
   * real page rather than raw JSON. `debug` still wins for the codes not mapped
   * below, so a dev 500 keeps its Youch stack trace.
   */
  protected renderStatusPages = true

  /**
   * A 404 is a normal outcome here — a mistyped slug, an old link — not
   * something to investigate, so it is handled without a log line. (The base
   * list is `[400, 422, 401]`.)
   */
  protected ignoreStatuses = [400, 401, 404, 422]

  /**
   * `500..599` is only a status page in production; leaving it unmapped in
   * development lets `renderErrorAsHTML` fall through to the debug stack trace.
   */
  protected statusPages: Record<StatusPageRange, StatusPageRenderer> = {
    '404': (_, { inertia }) => inertia.render('errors/not_found', {}),
    ...(app.inProduction
      ? { '500..599': (_, { inertia }) => inertia.render('errors/server_error', {}) }
      : {}),
  }

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
