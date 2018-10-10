import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PohlRocksImporterComponent } from './pohl-rocks-importer.component';

describe('PohlRocksImporterComponent', () => {
  let component: PohlRocksImporterComponent;
  let fixture: ComponentFixture<PohlRocksImporterComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PohlRocksImporterComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PohlRocksImporterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
