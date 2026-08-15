import { Container, ContainerModule } from 'inversify';
import { describe, expect, test } from 'vitest';
import { assisted, bindAssistedFactory, multiInjected } from './assistedInject.ts';

interface Plugin {
  readonly name: string;
}

type SubjectFactory = (label: string) => Subject;

const PluginKey = Symbol('Plugin');
const SubjectFactoryKey = Symbol('SubjectFactory');

class Subject {
  constructor(
    @multiInjected(PluginKey) readonly plugins: Plugin[],
    @assisted readonly label: string,
  ) {}
}

describe('bindAssistedFactory', () => {
  test('resolves every binding for multi-injected parameters', async () => {
    const container = new Container();
    const module = new ContainerModule(({ bind }) => {
      bind(PluginKey).toConstantValue({ name: 'one' });
      bind(PluginKey).toConstantValue({ name: 'two' });
      bindAssistedFactory<Subject, SubjectFactory>(
        bind,
        SubjectFactoryKey,
        Subject,
      );
    });

    await container.load(module);

    const subject = container.get<SubjectFactory>(SubjectFactoryKey)('test');
    expect(subject.label).toBe('test');
    expect(subject.plugins.map(({ name }) => name)).toEqual(['one', 'two']);
  });
});
