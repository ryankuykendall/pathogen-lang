// Server-side feature flag resolution. UI policy decisions are centralized
// here and surfaced to clients only as opaque feature strings — these tests
// pin the rules so a regression in the deny-list path can't silently grant
// publishing to a flagged or unverified user.

import { describe, expect, it } from 'vitest';

import { computeUserFeatures, isAdminUser } from '../../website/auth/features';
import type { AuthEnv, UserRow } from '../../website/auth/types';
import { UserFeature } from '../../website/auth/types';

function user(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 'u1',
    email: 'someone@example.com',
    email_lower: 'someone@example.com',
    handle: 'someone',
    display_name: 'Someone',
    created_at: Date.now(),
    verified_at: Date.now(),
    flagged: 0,
    flag_notes: null,
    ...overrides,
  };
}

function env(adminEmails?: string): AuthEnv {
  return { ADMIN_EMAILS: adminEmails } as unknown as AuthEnv;
}

describe('computeUserFeatures', () => {
  it('grants Publishing to a verified, unflagged user', () => {
    const features = computeUserFeatures(user(), env());
    expect(features).toContain(UserFeature.Publishing);
  });

  it('omits Publishing when verified_at is null', () => {
    const features = computeUserFeatures(user({ verified_at: null }), env());
    expect(features).not.toContain(UserFeature.Publishing);
  });

  it('omits Publishing when the user is flagged', () => {
    const features = computeUserFeatures(user({ flagged: 1 }), env());
    expect(features).not.toContain(UserFeature.Publishing);
  });

  it('treats missing flagged field as unflagged (pre-migration rows)', () => {
    const u = user();
    delete (u as { flagged?: number | null }).flagged;
    const features = computeUserFeatures(u, env());
    expect(features).toContain(UserFeature.Publishing);
  });

  it('grants AdminModeration when email matches ADMIN_EMAILS', () => {
    const features = computeUserFeatures(
      user({ email_lower: 'admin@example.com' }),
      env('admin@example.com'),
    );
    expect(features).toContain(UserFeature.AdminModeration);
  });

  it('grants AdminModeration with a multi-entry comma list', () => {
    const features = computeUserFeatures(
      user({ email_lower: 'second@example.com' }),
      env(' first@example.com , second@example.com '),
    );
    expect(features).toContain(UserFeature.AdminModeration);
  });

  it('denies AdminModeration to a flagged user even on the list', () => {
    const features = computeUserFeatures(
      user({ email_lower: 'admin@example.com', flagged: 1 }),
      env('admin@example.com'),
    );
    expect(features).not.toContain(UserFeature.AdminModeration);
  });

  it('denies AdminModeration to an unverified user even on the list', () => {
    const features = computeUserFeatures(
      user({ email_lower: 'admin@example.com', verified_at: null }),
      env('admin@example.com'),
    );
    expect(features).not.toContain(UserFeature.AdminModeration);
  });

  it('denies AdminModeration when ADMIN_EMAILS is unset', () => {
    const features = computeUserFeatures(
      user({ email_lower: 'admin@example.com' }),
      env(undefined),
    );
    expect(features).not.toContain(UserFeature.AdminModeration);
  });
});

describe('isAdminUser', () => {
  it('is case-insensitive on email comparison', () => {
    expect(
      isAdminUser(
        user({ email_lower: 'ryan.k@example.com' }),
        env('Ryan.K@Example.com'),
      ),
    ).toBe(true);
  });

  it('treats whitespace-only ADMIN_EMAILS as empty', () => {
    expect(
      isAdminUser(user({ email_lower: 'a@b.com' }), env('   ')),
    ).toBe(false);
  });
});
