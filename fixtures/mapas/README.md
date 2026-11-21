# Fixtures MapaConcreto

| Arquivo | Uso |
|---------|-----|
| `demo-laje-40m2.dxf` | DXF ASCII — laje 8×5 m (40 m²), `$INSUNITS=6` |
| `demo-laje-40m2.ifc` | IFC4 STEP — mesma laje com GUID + Qto GrossVolume=6 m³ / GrossArea=40 m² |
| `public/demo/mapaconcreto-demo.pdf` | Gerado por `npm run seed:mapas:check` — planta demo p/ raster do relatório |

Offline (sem Supabase): `npm run seed:mapas:check` · `npm run test` (inclui `pdf-raster` + plano demo).

## DWG

Não versionamos binário DWG proprietário. Pipeline:

1. Instale [ODA File Converter](https://www.opendesign.com/guestfiles/oda_file_converter) (registro gratuito).
2. Converta qualquer DWG de teste → DXF, **ou** suba `services/cad-convert` com `ODA_FILE_CONVERTER` no PATH e use **Importar DWG** no app.
3. O original `.dwg` fica no Storage; o DXF intermediário pode ser persistido em `intermediate_storage_path`.

Sem ODA: use o DXF acima. Sem SDK pago.
