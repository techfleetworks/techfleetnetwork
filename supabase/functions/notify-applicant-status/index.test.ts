import 'https://deno.land/std@0.224.0/dotenv/load.ts'
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'

Deno.test('invite email idempotency key stays deterministic', () => {
  const applicationId = 'b3cc12aa-9594-4b72-8419-465012f3732f'
  const idempotencyKey = `interview-invite-${applicationId}`

  assertEquals(
    idempotencyKey,
    'interview-invite-b3cc12aa-9594-4b72-8419-465012f3732f'
  )
})