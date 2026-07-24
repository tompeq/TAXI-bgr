import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { SmsPilotSmsSender } from './smspilot-sms.sender';

describe('SmsPilotSmsSender', () => {
  const apiKey = 'A'.repeat(64);
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends an OTP through the provider without a paid sender name', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ send: [{ status: '0' }] }),
    });
    global.fetch = fetchMock as typeof fetch;

    const sender = createSender();
    await sender.sendCode('+79141234567', '123456');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://smspilot.ru/api.php');
    expect(options.method).toBe('POST');
    expect(options.body).toBeInstanceOf(URLSearchParams);
    expect((options.body as URLSearchParams).toString()).toContain(
      'to=79141234567',
    );
    expect((options.body as URLSearchParams).toString()).toContain(
      'apikey=AAAAAAAA',
    );
    expect((options.body as URLSearchParams).toString()).not.toContain('from=');
  });

  it('rejects a provider-level error without exposing its details', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          error: { code: '207', description_ru: 'Insufficient funds' },
        }),
    }) as typeof fetch;

    await expect(
      createSender().sendCode('+79141234567', '123456'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  function createSender(sender = ''): SmsPilotSmsSender {
    const config = {
      getOrThrow: jest.fn((name: string) => {
        if (name === 'SMSPILOT_API_KEY') {
          return apiKey;
        }
        if (name === 'SMSPILOT_SENDER') {
          return sender;
        }
        throw new Error(`Unexpected setting: ${name}`);
      }),
    } as unknown as ConfigService;

    return new SmsPilotSmsSender(config);
  }
});
