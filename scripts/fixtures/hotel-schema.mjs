// Known fixture metadata for the proposed MySQL DDL, independent of readiness logic.
export function hotelSchemaMetadata() {
  return [
    { column_name: 'binding_id', data_type: 'varchar', column_type: 'varchar(64)', is_nullable: 'YES', column_default: null, character_maximum_length: 64 },
    ...['binding_evidence','manual_hotel_override','hotel_source_snapshot'].map(column_name => ({ column_name, data_type: 'json', column_type: 'json', is_nullable: 'YES', column_default: null, character_maximum_length: null })),
    { column_name: 'row_version', data_type: 'bigint', column_type: 'bigint unsigned', is_nullable: 'NO', column_default: '0', character_maximum_length: null },
  ];
}
export const hotelEngineMetadata = () => ['crewcheck_platform_profiles','crewcheck_platform_rosters','crewcheck_platform_stays'].map(table_name => ({ table_name, engine: 'InnoDB' }));
