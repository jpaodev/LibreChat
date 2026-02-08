import { shouldProxy } from './proxy';

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
  delete process.env.NO_PROXY;
  delete process.env.no_proxy;
});

afterAll(() => {
  process.env = originalEnv;
});

describe('shouldProxy', () => {
  describe('when NO_PROXY is not set', () => {
    it('returns true for any URL', () => {
      expect(shouldProxy('https://api.openai.com')).toBe(true);
    });

    it('returns true for null/undefined', () => {
      expect(shouldProxy(null)).toBe(true);
      expect(shouldProxy(undefined)).toBe(true);
    });
  });

  describe('when NO_PROXY is set to *', () => {
    it('returns false for any URL (proxy disabled globally)', () => {
      process.env.NO_PROXY = '*';
      expect(shouldProxy('https://api.openai.com')).toBe(false);
      expect(shouldProxy('https://anything.example.com')).toBe(false);
    });
  });

  describe('exact hostname match', () => {
    it('matches exact hostname', () => {
      process.env.NO_PROXY = 'localhost,api.openai.com';
      expect(shouldProxy('https://api.openai.com/v1/chat')).toBe(false);
      expect(shouldProxy('https://localhost:8080')).toBe(false);
    });

    it('does not match different hostnames', () => {
      process.env.NO_PROXY = 'localhost';
      expect(shouldProxy('https://api.openai.com')).toBe(true);
    });
  });

  describe('domain suffix match', () => {
    it('matches .svc.cluster.local suffix', () => {
      process.env.NO_PROXY = '.svc.cluster.local';
      expect(shouldProxy('http://litellm.litellm.svc.cluster.local:4000')).toBe(false);
    });

    it('matches without leading dot (implicit suffix)', () => {
      process.env.NO_PROXY = 'svc.cluster.local';
      expect(shouldProxy('http://litellm.litellm.svc.cluster.local:4000')).toBe(false);
    });

    it('does not match partial hostname that is not a suffix', () => {
      process.env.NO_PROXY = 'cluster.local';
      expect(shouldProxy('http://notcluster.localfoo.com')).toBe(true);
    });
  });

  describe('CIDR matching', () => {
    it('matches IP in 10.0.0.0/8 range', () => {
      process.env.NO_PROXY = '10.0.0.0/8';
      expect(shouldProxy('http://10.1.2.3:8080')).toBe(false);
    });

    it('does not match IP outside CIDR range', () => {
      process.env.NO_PROXY = '10.0.0.0/8';
      expect(shouldProxy('http://192.168.1.1:8080')).toBe(true);
    });

    it('matches IP in 172.16.0.0/12 range', () => {
      process.env.NO_PROXY = '172.16.0.0/12';
      expect(shouldProxy('http://172.20.0.5')).toBe(false);
    });

    it('matches IP in 192.168.0.0/16 range', () => {
      process.env.NO_PROXY = '192.168.0.0/16';
      expect(shouldProxy('http://192.168.1.100')).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('matches regardless of case', () => {
      process.env.NO_PROXY = 'API.OpenAI.COM';
      expect(shouldProxy('https://api.openai.com')).toBe(false);
    });
  });

  describe('respects no_proxy (lowercase)', () => {
    it('reads no_proxy env var', () => {
      process.env.no_proxy = 'localhost,.svc.cluster.local';
      expect(shouldProxy('http://litellm.litellm.svc.cluster.local:4000')).toBe(false);
    });
  });

  describe('real-world NO_PROXY from test-values.yaml', () => {
    beforeEach(() => {
      process.env.NO_PROXY =
        'localhost,172.16.0.0/12,10.0.0.0/8,100.64.0.0/10,192.168.0.0/16,metadata.google.internal,telekom.de,telekom.com,.svc.cluster.local,litellm.litellm,opensearch-cluster-master';
    });

    it('bypasses proxy for LiteLLM internal service', () => {
      expect(shouldProxy('http://litellm.litellm.svc.cluster.local:4000')).toBe(false);
    });

    it('bypasses proxy for litellm.litellm hostname', () => {
      expect(shouldProxy('http://litellm.litellm:4000')).toBe(false);
    });

    it('bypasses proxy for localhost', () => {
      expect(shouldProxy('http://localhost:3000')).toBe(false);
    });

    it('bypasses proxy for private IPs (10.x)', () => {
      expect(shouldProxy('http://10.0.0.1:8080')).toBe(false);
    });

    it('bypasses proxy for private IPs (172.16.x)', () => {
      expect(shouldProxy('http://172.20.0.5')).toBe(false);
    });

    it('bypasses proxy for telekom.de suffix', () => {
      expect(shouldProxy('https://some.service.telekom.de')).toBe(false);
    });

    it('uses proxy for external APIs like OpenAI', () => {
      expect(shouldProxy('https://api.openai.com')).toBe(true);
    });

    it('uses proxy for external APIs like Anthropic', () => {
      expect(shouldProxy('https://api.anthropic.com')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles empty string URL', () => {
      process.env.NO_PROXY = 'localhost';
      expect(shouldProxy('')).toBe(true);
    });

    it('handles URL without scheme', () => {
      process.env.NO_PROXY = 'localhost';
      expect(shouldProxy('localhost:8080')).toBe(false);
    });

    it('handles whitespace in NO_PROXY entries', () => {
      process.env.NO_PROXY = ' localhost , api.openai.com ';
      expect(shouldProxy('http://localhost')).toBe(false);
      expect(shouldProxy('https://api.openai.com')).toBe(false);
    });

    it('ignores empty entries from trailing commas', () => {
      process.env.NO_PROXY = 'localhost,,api.openai.com,';
      expect(shouldProxy('http://localhost')).toBe(false);
      expect(shouldProxy('https://api.openai.com')).toBe(false);
      expect(shouldProxy('https://other.com')).toBe(true);
    });
  });
});
