// PRUEBAS UNITARIAS - R-06 (listarDeLaEmpresa)
// Las rutas que listan registros (bitácora, clientes, contratos, usuarios y
// vínculos) usan esta función en lugar de repetir el mismo bloque.
// La base de datos se simula: la prueba no se conecta a PostgreSQL.
const { pool } = require("../../src/db");
const { listarDeLaEmpresa } = require("../../src/utils/listados");

const CONSULTA = "SELECT * FROM clientes WHERE empresa_id = $1";

function respuestaSimulada() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
}

afterEach(() => jest.restoreAllMocks());
afterAll(() => pool.end());

describe("R-06 listarDeLaEmpresa", () => {
  test("consulta con la empresa de la sesión y responde las filas", async () => {
    const filas = [{ id: 1 }, { id: 2 }];
    const consulta = jest.spyOn(pool, "query").mockResolvedValue({ rows: filas });
    const res = respuestaSimulada();

    await listarDeLaEmpresa("Error al listar clientes", CONSULTA)({ authUser: { empresaId: 7 } }, res);

    expect(consulta).toHaveBeenCalledWith(CONSULTA, [7]);
    expect(res.json).toHaveBeenCalledWith(filas);
    expect(res.status).not.toHaveBeenCalled();
  });

  test("si la consulta falla responde 500 con el título de la ruta y sin el detalle (R-04)", async () => {
    jest.spyOn(pool, "query").mockRejectedValue(new Error("fallo simulado"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    const res = respuestaSimulada();

    await listarDeLaEmpresa("Error al listar clientes", CONSULTA)({ authUser: { empresaId: 7 } }, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0].error).toBe("Error al listar clientes");
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain("fallo simulado");
  });
});
