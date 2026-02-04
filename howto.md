
**DWG Reader Conversion: Binary Package Patterns & Best Practices**

1. **Class Construction**  
 - Use `Extend(Base, { ... })` or `ReadClass({ ... })` directly in the class definition.  
 - Pass the spec object inline, not as a separate variable.

2. **Type Aliases**  
 - Use local type aliases (e.g., `BD`, `BD3`, `BS`, `BL`, etc.) for field types, not raw binary types.

3. **Conditional Fields & Versioning**  
 - Use `bin.Optional(predicate, type)` for single conditional fields.  
 - Use `bin.If(predicate, trueSpec, falseSpec)` for branching between sets of fields; assign to a property (e.g., `conditional: bin.If(...)`).  
 - For version checks, use `(s as bitsin).ver(VER.R2004) >= 0` or similar.

4. **Arrays and Dynamic Lengths**  
 - Use `bin.ArrayType(lenFn, type)` for arrays with runtime-determined length.  
 - Example: `vertexlist: bin.ArrayType(s => BL.get(s).v, BD3)`

5. **Spec-Driven Parsing**  
 - All parsing logic (version checks, conditional fields, array lengths, etc.) should be in the spec.  
 - Avoid manual parse methods; use declarative specs.

6. **Entity Extension**  
 - Use `ExtendEntity` to add fields to a base entity class, supporting DWG’s inheritance.

7. **Field Naming**  
 - Preserve DWG field names and type aliases for clarity.

8. **Example Pattern**  
```typescript
class DRW_VERTEX_2D extends ExtendEntity(Entity, {
	pt: BD2,
	startWidth: BD,
	endWidth: BD,
	bulge: BD,
	flag: R16,
	tangentDir: bin.Optional(s => (s as bitsin).ver(VER.R2004) >= 0, BD),
	extrusion: bin.Optional(s => (s as bitsin).ver(VER.R2004) >= 0, BD3)
}) {}
```

9. **Versioning**  
 - Always use the stream’s version-check idiom: `(s as bitsin).ver(VER.Rxxxx) >= 0`.

10. **Best Practices**  
 - Factor repeated logic into helpers.  
 - Avoid manual field assignment and mutation.  
 - Use functional helpers for concise, readable specs.  
 - Keep specs declarative and type-safe.

---

**To continue work:**  
- Reference this guide for any new entity or refactor.
- Specify which DWG structure or class to convert next.
- All parsing logic should be declarative and spec-driven.

---

You can copy-paste this into a new chat session to ensure continuity!