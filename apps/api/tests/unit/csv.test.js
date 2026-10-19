const { parseCsv, parseCsvRecords, toCsv } = require('../../src/lib/csv');
const { parseFlexibleDate, formatDateOnly } = require('../../src/lib/dates');

describe('parseCsv', () => {
  test('handles quotes, escaped quotes, commas and newlines inside fields, CRLF and BOM', () => {
    const text = '\uFEFFname,address\r\n"Rao, Asha","12 ""MG"" Road\nPune"\r\nBala,\r\n\r\n';

    expect(parseCsv(text)).toEqual([
      ['name', 'address'],
      ['Rao, Asha', '12 "MG" Road\nPune'],
      ['Bala', ''],
    ]);
  });

  test('rejects an unclosed quote', () => {
    expect(() => parseCsv('a,b\n"open,1')).toThrow(/unclosed quote/);
  });
});

describe('parseCsvRecords', () => {
  const columns = [
    { key: 'admission_no', required: true },
    { key: 'first_name', required: true },
    { key: 'class' },
  ];

  test('normalises headers and numbers rows like a spreadsheet', () => {
    const { records } = parseCsvRecords(
      'Admission No, First-Name ,CLASS\nA1,Asha,1\nA2,Bala,2',
      columns,
    );

    expect(records).toEqual([
      { rowNumber: 2, values: { admission_no: 'A1', first_name: 'Asha', class: '1' } },
      { rowNumber: 3, values: { admission_no: 'A2', first_name: 'Bala', class: '2' } },
    ]);
  });

  test('reports unknown and missing columns', () => {
    expect.assertions(1);
    try {
      parseCsvRecords('admission_no,nickname\nA1,x', columns);
    } catch (error) {
      expect(error.details).toEqual({
        unknownColumns: ['nickname'],
        missingColumns: ['first_name'],
        duplicatedColumns: [],
      });
    }
  });

  test('caps the number of rows', () => {
    const text = `admission_no,first_name\n${'A,B\n'.repeat(5)}`;
    expect(() => parseCsvRecords(text, columns, { maxRows: 4 })).toThrow(/at most 4 rows/);
  });
});

describe('toCsv', () => {
  test('quotes when needed and neutralises spreadsheet formulas', () => {
    expect(toCsv([['a,b', 'say "hi"', '=SUM(A1)', 'plain']])).toBe(
      '"a,b","say ""hi""",\'=SUM(A1),plain',
    );
  });
});

describe('parseFlexibleDate', () => {
  test.each([
    ['2019-06-15', '2019-06-15'],
    ['15-06-2019', '2019-06-15'],
    ['15/6/2019', '2019-06-15'],
    ['5.6.2019', '2019-06-05'],
  ])('reads %s', (input, expected) => {
    expect(formatDateOnly(parseFlexibleDate(input))).toBe(expected);
  });

  test.each(['31-02-2019', '2019/06/15', '06-15-2019', 'yesterday'])('rejects %s', (input) => {
    expect(parseFlexibleDate(input)).toBeNull();
  });
});
