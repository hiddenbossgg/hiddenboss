/*
|--------------------------------------------------------------------------
| Scheduler
|--------------------------------------------------------------------------
|
| Recurring jobs are registered here.
|
| There are none yet: imports are triggered manually by a league admin, and
| rankings recompute on request rather than on a timer. Because a scheduled sync
| would enqueue exactly the same job a manual refresh does, adding one later is
| configuration rather than redesign.
|
| Example:
|
|   import ImportEventJob from '#jobs/import_event_job'
|
|   ImportEventJob.schedule({ eventImportId })
|     .cron('0 * * * *')
|     .run()
|
*/

export {}
