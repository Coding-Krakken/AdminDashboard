import type { ModuleManifest } from "./types";

export class ModuleRegistry {
  private manifests = new Map<string, ModuleManifest>();

  register(manifest: ModuleManifest): void {
    if (this.manifests.has(manifest.id)) {
      throw new Error(`Module '${manifest.id}' is already registered.`);
    }

    this.validateDependencies(manifest);
    this.manifests.set(manifest.id, manifest);
  }

  registerMany(manifests: ModuleManifest[]): void {
    const plan = this.resolveLoadPlan(manifests);
    const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));

    for (const moduleId of plan) {
      const manifest = byId.get(moduleId);
      if (manifest) {
        this.register(manifest);
      }
    }
  }

  resolveLoadPlan(manifests: ModuleManifest[]): string[] {
    const inputById = new Map<string, ModuleManifest>();
    for (const manifest of manifests) {
      if (inputById.has(manifest.id) || this.manifests.has(manifest.id)) {
        throw new Error(`Module '${manifest.id}' is already registered.`);
      }

      inputById.set(manifest.id, manifest);
    }

    const dependenciesByModule = new Map<string, string[]>();
    const dependentsByModule = new Map<string, string[]>();
    const unresolvedMissing = new Map<string, string[]>();

    for (const manifest of manifests) {
      const deps = manifest.dependsOn ?? [];
      const missing = deps.filter(
        (dep) => !this.manifests.has(dep) && !inputById.has(dep)
      );

      if (missing.length > 0) {
        unresolvedMissing.set(manifest.id, missing);
      }

      dependenciesByModule.set(
        manifest.id,
        deps.filter((dep) => !this.manifests.has(dep))
      );
      dependentsByModule.set(manifest.id, []);
    }

    if (unresolvedMissing.size > 0) {
      const details = Array.from(unresolvedMissing.entries())
        .map(([moduleId, deps]) => `${moduleId} -> [${deps.join(", ")}]`)
        .join("; ");
      throw new Error(`Unresolved module dependencies: ${details}`);
    }

    const inDegree = new Map<string, number>();
    for (const [moduleId, deps] of dependenciesByModule.entries()) {
      inDegree.set(moduleId, deps.length);
    }

    for (const [moduleId, deps] of dependenciesByModule.entries()) {
      for (const dep of deps) {
        if (dependentsByModule.has(dep)) {
          dependentsByModule.get(dep)?.push(moduleId);
        }
      }
    }

    const sortByDeterministicOrder = (leftId: string, rightId: string): number => {
      const left = inputById.get(leftId);
      const right = inputById.get(rightId);
      const leftOrder = left?.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = right?.order ?? Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return leftId.localeCompare(rightId);
    };

    const queue = Array.from(inDegree.entries())
      .filter(([, degree]) => degree === 0)
      .map(([id]) => id)
      .sort(sortByDeterministicOrder);

    const plan: string[] = [];
    while (queue.length > 0) {
      const nextId = queue.shift();
      if (!nextId) {
        continue;
      }

      plan.push(nextId);

      const dependents = dependentsByModule.get(nextId) ?? [];
      for (const dependentId of dependents) {
        if (!inDegree.has(dependentId)) {
          continue;
        }

        const nextDegree = (inDegree.get(dependentId) ?? 0) - 1;
        inDegree.set(dependentId, nextDegree);
        if (nextDegree === 0) {
          queue.push(dependentId);
          queue.sort(sortByDeterministicOrder);
        }
      }
    }

    if (plan.length !== dependenciesByModule.size) {
      const blocked = Array.from(inDegree.entries())
        .filter(([, degree]) => degree > 0)
        .map(([id]) => id)
        .sort();
      throw new Error(
        `Circular module dependencies detected for: ${blocked.join(", ")}`
      );
    }

    return plan;
  }

  upsert(manifest: ModuleManifest): void {
    if (this.manifests.has(manifest.id)) {
      this.manifests.set(manifest.id, manifest);
      return;
    }

    this.register(manifest);
  }

  get(id: string): ModuleManifest | undefined {
    return this.manifests.get(id);
  }

  list(): ModuleManifest[] {
    return Array.from(this.manifests.values()).sort((a, b) => {
      const aOrder = a.order ?? Number.MAX_SAFE_INTEGER;
      const bOrder = b.order ?? Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder;
    });
  }

  remove(id: string): void {
    this.manifests.delete(id);
  }

  private validateDependencies(manifest: ModuleManifest): void {
    const deps = manifest.dependsOn ?? [];
    for (const dep of deps) {
      if (!this.manifests.has(dep)) {
        throw new Error(
          `Module '${manifest.id}' depends on '${dep}', but '${dep}' is not registered yet.`
        );
      }
    }
  }

  private canRegister(manifest: ModuleManifest): boolean {
    const deps = manifest.dependsOn ?? [];
    return deps.every((dep) => this.manifests.has(dep));
  }
}
